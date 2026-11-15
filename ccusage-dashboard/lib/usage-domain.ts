import type {
  UsageDevice,
  UsageDeviceFilter,
  UsageModel,
  UsagePeriod,
  UsageSession,
  UsageTotals,
} from "./usage-types";
import { validDateKey } from "./usage-range";
import { usageSourceOptions } from "./usage-types";
import { canonicalModelName } from "./model-names";

type UnknownRecord = Record<string, unknown>;
type UsageModelTotals = UsageTotals & {
  isFallback?: boolean;
  missingPricing?: boolean;
};

export function createEmptyTotals(): UsageTotals {
  return {
    cacheCreationTokens: 0,
    cacheReadTokens: 0,
    costUSD: 0,
    inputTokens: 0,
    outputTokens: 0,
    reasoningOutputTokens: 0,
    totalTokens: 0,
  };
}

function asRecord(value: unknown): UnknownRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as UnknownRecord)
    : {};
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function asNumber(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;

  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  return 0;
}

function asString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function rawModelNames(value: unknown): string[] {
  return asArray(value).flatMap((item) => {
    const name = asString(item);
    return name ? [name] : [];
  });
}

function modelNames(value: unknown): string[] {
  return [...new Set(rawModelNames(value).map(canonicalModelName))].sort();
}

export function usageTotalsFrom(value: unknown): UsageTotals {
  const record = asRecord(value);
  const metadata = asRecord(record.metadata);
  const inputTokens = asNumber(record.inputTokens);
  const outputTokens = asNumber(record.outputTokens);
  const cacheCreationTokens = asNumber(record.cacheCreationTokens);
  const cacheReadTokens = asNumber(record.cacheReadTokens);
  const reasoningOutputTokens =
    asNumber(record.reasoningOutputTokens) ||
    asNumber(metadata.reasoningOutputTokens);
  const totalTokens =
    asNumber(record.totalTokens) ||
    inputTokens + outputTokens + cacheCreationTokens + cacheReadTokens;
  const unpricedModels = modelNames(record.unpricedModels);
  // Reasoning is a subset of output in ccusage, not another additive bucket.

  return {
    cacheCreationTokens,
    cacheReadTokens,
    costUSD:
      asNumber(record.costUSD) ||
      asNumber(record.totalCost) ||
      asNumber(record.cost),
    inputTokens,
    outputTokens,
    reasoningOutputTokens,
    totalTokens,
    ...(unpricedModels.length ? { unpricedModels } : {}),
    ...(record.pricingUnknown === true ? { pricingUnknown: true } : {}),
  };
}

export function addUsageTotals(
  left: UsageTotals,
  right: UsageTotals,
): UsageTotals {
  const unpricedModels = modelNames([
    ...(left.unpricedModels ?? []),
    ...(right.unpricedModels ?? []),
  ]);
  return {
    cacheCreationTokens: left.cacheCreationTokens + right.cacheCreationTokens,
    cacheReadTokens: left.cacheReadTokens + right.cacheReadTokens,
    costUSD: left.costUSD + right.costUSD,
    inputTokens: left.inputTokens + right.inputTokens,
    outputTokens: left.outputTokens + right.outputTokens,
    reasoningOutputTokens:
      left.reasoningOutputTokens + right.reasoningOutputTokens,
    totalTokens: left.totalTokens + right.totalTokens,
    ...(unpricedModels.length ? { unpricedModels } : {}),
    ...(left.pricingUnknown || right.pricingUnknown
      ? { pricingUnknown: true }
      : {}),
  };
}

function periodLabel(record: UnknownRecord): string {
  return (
    asString(record.date) ??
    asString(record.week) ??
    asString(record.month) ??
    asString(record.period) ??
    asString(record.label) ??
    "未知时间"
  );
}

function rawModelEntries(record: UnknownRecord): [string, UnknownRecord][] {
  const direct = Object.entries(asRecord(record.models));
  if (direct.length)
    return direct.map(([name, model]) => [name, asRecord(model)]);
  const list = asArray(record.models);
  return (list.length ? list : asArray(record.modelBreakdowns)).flatMap(
    (entry) => {
      const model = asRecord(entry);
      const name = asString(model.modelName) ?? asString(model.name);
      return name ? [[name, model]] : [];
    },
  );
}

function modelMap(
  entries: ReturnType<typeof rawModelEntries>,
  reportUnpriced: ReadonlySet<string>,
  scopedUnpriced: ReadonlySet<string>,
): Record<string, UsageModelTotals> {
  const models = new Map<string, UsageModelTotals>();

  for (const [rawName, rawModel] of entries) {
    // Agent-specific entries and API/version aliases carry distinct usage.
    const name = canonicalModelName(rawName);
    const previous = models.get(name);
    const totals = usageTotalsFrom(rawModel);
    const identifier = rawName.trim();
    const missingPricing =
      rawModel.missingPricing === true ||
      Boolean(totals.unpricedModels?.length) ||
      (rawModel.missingPricing !== false &&
        totals.totalTokens > 0 &&
        reportUnpriced.has(identifier) &&
        (!scopedUnpriced.has(identifier) || totals.costUSD <= 0));
    models.set(name, {
      ...(previous ? addUsageTotals(previous, totals) : totals),
      isFallback: Boolean(previous?.isFallback || rawModel.isFallback === true),
      ...(previous?.missingPricing || missingPricing
        ? { missingPricing: true }
        : {}),
    });
  }

  return Object.fromEntries(models);
}

/** Match report hints to raw names. Scoped evidence keeps priced rows separate. */
function pricedModelRows(records: UnknownRecord[], unpriced: unknown) {
  const rows = records.map((record) => ({
    record,
    entries: rawModelEntries(record),
  }));
  const reportUnpriced = new Set(rawModelNames(unpriced));
  const scopedUnpriced = new Set<string>();
  if (reportUnpriced.size) {
    for (const { record, entries } of rows) {
      for (const name of rawModelNames(record.unpricedModels)) {
        scopedUnpriced.add(name);
      }
      for (const [name, model] of entries) {
        if (
          model.missingPricing === true ||
          rawModelNames(model.unpricedModels).length
        ) {
          scopedUnpriced.add(name.trim());
        }
      }
    }
  }
  return rows.map(({ record, entries }) => ({
    record,
    models: modelMap(entries, reportUnpriced, scopedUnpriced),
  }));
}

function pricedTotals(
  record: UnknownRecord,
  models: Record<string, UsageModelTotals>,
): UsageTotals {
  const totals = usageTotalsFrom(record);
  const missingModels = Object.entries(models)
    .filter(([, model]) => model.missingPricing)
    .map(([name]) => name);
  const unpricedModels = modelNames([
    ...(totals.unpricedModels ?? []),
    ...missingModels,
  ]);
  // Older reports used zero for unknown prices without any diagnostics. The
  // UI cannot verify that this is free usage, so retain an explicit unknown.
  const unknown =
    totals.pricingUnknown ||
    (totals.totalTokens > 0 && totals.costUSD === 0 && !unpricedModels.length);
  return {
    ...totals,
    ...(unpricedModels.length ? { unpricedModels } : {}),
    ...(unknown ? { pricingUnknown: true } : {}),
  };
}

export function usagePeriodsFrom(report: unknown, key: string): UsagePeriod[] {
  const rawReport = asRecord(report);
  const records = asArray(rawReport[key])
    .map(asRecord)
    .filter((record) => key !== "daily" || validDateKey(periodLabel(record)));
  return pricedModelRows(records, asRecord(rawReport.totals).unpricedModels)
    .map(({ record, models }) => ({
      ...pricedTotals(record, models),
      label: periodLabel(record),
      models,
    }))
    .sort((left, right) => left.label.localeCompare(right.label));
}

export function usageSessionsFrom(report: unknown): UsageSession[] {
  const rawReport = asRecord(report);
  const rawSessions = asArray(rawReport.sessions);
  const records = (
    rawSessions.length ? rawSessions : asArray(rawReport.session)
  ).map(asRecord);

  return pricedModelRows(records, asRecord(rawReport.totals).unpricedModels)
    .map(({ record, models }) => {
      const reportedModels = modelNames(record.modelsUsed);
      const metadata = asRecord(record.metadata);

      return {
        ...pricedTotals(record, models),
        id:
          asString(record.sessionId) ??
          asString(record.sessionFile) ??
          asString(record.period) ??
          "未命名会话",
        lastActivity:
          asString(record.lastActivity) ?? asString(metadata.lastActivity),
        models: Object.keys(models).length
          ? Object.keys(models)
          : reportedModels,
        project: asString(record.project) ?? asString(record.directory),
        source: usageSourceOptions.find(
          (source) => source.value === record.agent,
        )?.value,
      };
    })
    .sort((left, right) => {
      const leftTime = left.lastActivity ? Date.parse(left.lastActivity) : 0;
      const rightTime = right.lastActivity ? Date.parse(right.lastActivity) : 0;
      return rightTime - leftTime;
    });
}

export function usageModelsFrom(periods: UsagePeriod[]): UsageModel[] {
  const models = new Map<string, UsageModel>();

  for (const period of periods) {
    for (const [name, usage] of Object.entries(period.models)) {
      const previous = models.get(name);
      models.set(name, {
        ...(previous ? addUsageTotals(previous, usage) : usage),
        isFallback: Boolean(previous?.isFallback || usage.isFallback),
        ...(previous?.missingPricing || usage.missingPricing
          ? { missingPricing: true }
          : {}),
        name,
      });
    }
  }

  return [...models.values()].sort(
    (left, right) => right.totalTokens - left.totalTokens,
  );
}

function addModelMaps(
  left: UsagePeriod["models"],
  right: UsagePeriod["models"],
): UsagePeriod["models"] {
  const combined = { ...left };

  for (const [name, usage] of Object.entries(right)) {
    const previous = Object.hasOwn(combined, name) ? combined[name] : undefined;
    combined[name] = {
      ...(previous ? addUsageTotals(previous, usage) : usage),
      isFallback: Boolean(previous?.isFallback || usage.isFallback),
      ...(previous?.missingPricing || usage.missingPricing
        ? { missingPricing: true }
        : {}),
    };
  }

  return combined;
}

export function mergeUsagePeriods(...groups: UsagePeriod[][]): UsagePeriod[] {
  const periods = new Map<string, UsagePeriod>();

  for (const group of groups) {
    for (const period of group) {
      const previous = periods.get(period.label);
      periods.set(
        period.label,
        previous
          ? {
              ...addUsageTotals(previous, period),
              label: period.label,
              models: addModelMaps(previous.models, period.models),
            }
          : {
              ...period,
              models: { ...period.models },
            },
      );
    }
  }

  return [...periods.values()].sort((left, right) =>
    left.label.localeCompare(right.label),
  );
}

export function usagePeriodsInRange(
  periods: UsagePeriod[],
  startDate?: string,
  endDate?: string,
): UsagePeriod[] {
  return periods.filter(
    (period) =>
      (!startDate || period.label >= startDate) &&
      (!endDate || period.label <= endDate),
  );
}

export function monthlyUsagePeriods(daily: UsagePeriod[]): UsagePeriod[] {
  const periods = new Map<string, UsagePeriod>();

  for (const day of daily) {
    const label = day.label.slice(0, 7);
    const previous = periods.get(label);
    periods.set(label, {
      ...(previous ? addUsageTotals(previous, day) : day),
      label,
      models: previous
        ? addModelMaps(previous.models, day.models)
        : { ...day.models },
    });
  }

  return [...periods.values()].sort((left, right) =>
    left.label.localeCompare(right.label),
  );
}

function isoWeekStart(label: string): string {
  const date = new Date(label + "T00:00:00.000Z");
  if (Number.isNaN(date.getTime())) return label;

  const weekday = date.getUTCDay();
  const daysSinceMonday = (weekday + 6) % 7;
  date.setUTCDate(date.getUTCDate() - daysSinceMonday);
  return date.toISOString().slice(0, 10);
}

export function weeklyUsagePeriods(daily: UsagePeriod[]): UsagePeriod[] {
  const periods = new Map<string, UsagePeriod>();

  for (const day of daily) {
    const label = isoWeekStart(day.label);
    const previous = periods.get(label);
    periods.set(label, {
      ...(previous ? addUsageTotals(previous, day) : day),
      label,
      models: previous
        ? addModelMaps(previous.models, day.models)
        : { ...day.models },
    });
  }

  return [...periods.values()].sort((left, right) =>
    left.label.localeCompare(right.label),
  );
}

export function latestUsageLabel(periods: UsagePeriod[]): string | null {
  return periods.length ? (periods.at(-1)?.label ?? null) : null;
}

export function deviceNameFromFile(fileName: string): string {
  const stem = fileName.replace(/\.json$/i, "").replace(/[-_]+/g, " ");
  return stem.replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export type UsageDeviceSelection = {
  activeDeviceIds: string[];
  includeLocal: boolean;
  selectedImportedDevices: UsageDevice[];
};

export function selectUsageDevices(
  filter: UsageDeviceFilter,
  importedDevices: UsageDevice[],
): UsageDeviceSelection {
  const importedIds = new Set(importedDevices.map((device) => device.id));
  if (filter !== "all" && filter !== "local" && !importedIds.has(filter)) {
    throw new Error("所选设备不存在，请重新选择。");
  }
  const normalizedFilter = filter;
  const includeLocal =
    normalizedFilter === "all" || normalizedFilter === "local";
  const selectedImportedDevices =
    normalizedFilter === "all"
      ? importedDevices
      : importedDevices.filter((device) => device.id === normalizedFilter);

  return {
    activeDeviceIds: [
      ...(includeLocal ? ["local"] : []),
      ...selectedImportedDevices.map((device) => device.id),
    ],
    includeLocal,
    selectedImportedDevices,
  };
}
