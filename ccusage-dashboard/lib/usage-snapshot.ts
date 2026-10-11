import {
  addUsageTotals,
  createEmptyTotals,
  mergeUsagePeriods,
  monthlyUsagePeriods,
  usageModelsFrom,
  usagePeriodsInRange,
  weeklyUsagePeriods,
  selectUsageDevices,
} from "./usage-domain";
import type {
  UsageDevice,
  UsagePeriod,
  UsageSession,
  UsageSnapshot,
  UsageSource,
} from "./usage-types";
import { recordedUsageRange, type UsageRange } from "./usage-range";

type SnapshotInput = {
  range: UsageRange;
  source: UsageSource;
  device: string;
  local: {
    daily: UsagePeriod[];
    sessions: UsageSession[];
    error?: string;
    sessionError?: string;
  } | null;
  imports: {
    devices: UsageDevice[];
    dailyByDevice: Record<string, UsagePeriod[]>;
    warnings: string[];
  };
  generatedAt?: string;
};

/** One scope in, one internally consistent snapshot out. No IO or UI state. */
export function assembleUsageSnapshot({
  range,
  source,
  device,
  local: localReport,
  imports,
  generatedAt = new Date().toISOString(),
}: SnapshotInput): UsageSnapshot {
  const selection = selectUsageDevices(device, imports.devices);
  const local = selection.includeLocal ? localReport : null;
  const warnings = [...imports.warnings];
  const localDaily = usagePeriodsInRange(
    local?.daily ?? [],
    range.allTime ? undefined : range.start,
    range.end,
  );
  if (local?.error) warnings.push(local.error);
  if (local?.sessionError) warnings.push(local.sessionError);
  const devices: UsageDevice[] = [
    {
      id: "local",
      name: "本机",
      kind: "local",
      source,
      dailyEntries: localDaily.length,
      latestDate: localDaily.at(-1)?.label ?? null,
      updatedAt: local && !local.error ? generatedAt : null,
      status: !local ? "idle" : local.error ? "error" : "ready",
      rangeDays: localDaily.length,
      rangeTokens: localDaily.reduce((sum, row) => sum + row.totalTokens, 0),
    },
    ...imports.devices.map((item) => {
      const rows = usagePeriodsInRange(
        imports.dailyByDevice[item.id] ?? [],
        range.allTime ? undefined : range.start,
        range.end,
      );
      return {
        ...item,
        status: "ready" as const,
        rangeDays: rows.length,
        rangeTokens: rows.reduce((sum, row) => sum + row.totalTokens, 0),
      };
    }),
  ];
  const selected = selection.selectedImportedDevices;
  const compatible = selected.filter((item) => {
    if (source === "all" || item.source === source) return true;
    if (item.source === "all")
      warnings.push(`${item.name} 是混合来源汇总，已从单一 Agent 筛选中排除。`);
    return false;
  });
  const importedDaily = compatible.flatMap((item) =>
    usagePeriodsInRange(
      imports.dailyByDevice[item.id] ?? [],
      range.allTime ? undefined : range.start,
      range.end,
    ),
  );
  const daily = mergeUsagePeriods(localDaily, importedDaily);
  const resolvedRange = recordedUsageRange(
    range,
    daily.map((period) => period.label),
  );
  const weekly = weeklyUsagePeriods(daily);
  const monthly = monthlyUsagePeriods(daily);
  const sessions = local?.sessions ?? [];
  const activeDeviceIds = [
    ...(local && !local.error ? ["local"] : []),
    ...compatible.map((item) => item.id),
  ];
  return {
    range: resolvedRange,
    source,
    warnings,
    devices,
    activeDeviceIds,
    daily,
    weekly,
    monthly,
    sessions,
    generatedAt,
    sessionStatus: !local
      ? "aggregate-only"
      : local.error || local.sessionError
        ? "unavailable"
        : "ready",
    mode: "live",
    reader: "ccusage",
    offline: true,
    dataPath: "local",
    weeklyMethod: "daily-derived",
    totals: daily.reduce(addUsageTotals, createEmptyTotals()),
    models: usageModelsFrom(daily),
    raw: { range: resolvedRange, source, activeDeviceIds, daily, sessions },
  };
}
