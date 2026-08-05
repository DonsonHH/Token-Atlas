import type {
  UsageDevice,
  UsageDeviceFilter,
  UsageModel,
  UsagePeriod,
  UsageSession,
  UsageTotals,
} from "./usage-types";

type UnknownRecord = Record<string, unknown>;
type UsageModelTotals = UsageTotals & { isFallback?: boolean };

const MAXIMUM_LOOKBACK_DAYS = 365;

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
    inputTokens +
      outputTokens +
      cacheCreationTokens +
      cacheReadTokens +
      reasoningOutputTokens;

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
  };
}

export function addUsageTotals(
  left: UsageTotals,
  right: UsageTotals
): UsageTotals {
  return {
    cacheCreationTokens: left.cacheCreationTokens + right.cacheCreationTokens,
    cacheReadTokens: left.cacheReadTokens + right.cacheReadTokens,
    costUSD: left.costUSD + right.costUSD,
    inputTokens: left.inputTokens + right.inputTokens,
    outputTokens: left.outputTokens + right.outputTokens,
    reasoningOutputTokens:
      left.reasoningOutputTokens + right.reasoningOutputTokens,
    totalTokens: left.totalTokens + right.totalTokens,
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

function modelMap(
  value: unknown,
  fallback: unknown = []
): Record<string, UsageModelTotals> {
  const directModels = Object.entries(asRecord(value));

  if (directModels.length) {
    return Object.fromEntries(
      directModels.map(([name, model]) => {
        const rawModel = asRecord(model);

        return [
          name,
          {
            ...usageTotalsFrom(rawModel),
            isFallback: rawModel.isFallback === true,
          },
        ];
      })
    );
  }

  const fallbackModels = asArray(value).length ? asArray(value) : asArray(fallback);
  const models: Array<[string, UsageModelTotals]> = [];

  for (const model of fallbackModels) {
    const rawModel = asRecord(model);
    const name = asString(rawModel.modelName) ?? asString(rawModel.name);
    if (!name) continue;

    models.push([
      name,
      {
        ...usageTotalsFrom(rawModel),
        isFallback: rawModel.isFallback === true,
      },
    ]);
  }

  return Object.fromEntries(models);
}

export function usagePeriodsFrom(report: unknown, key: string): UsagePeriod[] {
  return asArray(asRecord(report)[key])
    .map((entry) => {
      const record = asRecord(entry);

      return {
        ...usageTotalsFrom(record),
        label: periodLabel(record),
        models: modelMap(record.models, record.modelBreakdowns),
      };
    })
    .sort((left, right) => left.label.localeCompare(right.label));
}

export function usageSessionsFrom(report: unknown): UsageSession[] {
  const rawReport = asRecord(report);
  const rawSessions = asArray(rawReport.sessions);

  return (rawSessions.length ? rawSessions : asArray(rawReport.session))
    .map((entry) => {
      const record = asRecord(entry);
      const models = modelMap(record.models, record.modelBreakdowns);
      const reportedModels = asArray(record.modelsUsed).filter(
        (model): model is string => typeof model === "string"
      );
      const metadata = asRecord(record.metadata);

      return {
        ...usageTotalsFrom(record),
        id:
          asString(record.sessionId) ??
          asString(record.sessionFile) ??
          asString(record.period) ??
          "未命名会话",
        lastActivity:
          asString(record.lastActivity) ?? asString(metadata.lastActivity),
        models: Object.keys(models).length ? Object.keys(models) : reportedModels,
        project: asString(record.project) ?? asString(record.directory),
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
        name,
      });
    }
  }

  return [...models.values()].sort(
    (left, right) => right.totalTokens - left.totalTokens
  );
}

function addModelMaps(
  left: UsagePeriod["models"],
  right: UsagePeriod["models"]
): UsagePeriod["models"] {
  const combined = { ...left };

  for (const [name, usage] of Object.entries(right)) {
    const previous = combined[name];
    combined[name] = {
      ...(previous ? addUsageTotals(previous, usage) : usage),
      isFallback: Boolean(previous?.isFallback || usage.isFallback),
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
            }
      );
    }
  }

  return [...periods.values()].sort((left, right) =>
    left.label.localeCompare(right.label)
  );
}

export function recentUsagePeriods(
  daily: UsagePeriod[],
  days: number
): UsagePeriod[] {
  const date = new Date();
  date.setHours(0, 0, 0, 0);
  date.setDate(date.getDate() - days + 1);
  const cutoff = date.toISOString().slice(0, 10);

  return daily.filter((period) => period.label >= cutoff);
}

export function usagePeriodsInRange(
  periods: UsagePeriod[],
  startDate?: string,
  endDate?: string
): UsagePeriod[] {
  return periods.filter(
    (period) =>
      (!startDate || period.label >= startDate) &&
      (!endDate || period.label <= endDate)
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
    left.label.localeCompare(right.label)
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
    left.label.localeCompare(right.label)
  );
}

export function latestUsageLabel(periods: UsagePeriod[]): string | null {
  return periods.length ? periods.at(-1)?.label ?? null : null;
}

export function deviceNameFromFile(fileName: string): string {
  const stem = fileName.replace(/\.json$/i, "").replace(/[-_]+/g, " ");
  return stem.replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export function normalizeUsageDays(days: number): number {
  if (!Number.isFinite(days)) return 14;
  return Math.min(Math.max(Math.trunc(days), 1), MAXIMUM_LOOKBACK_DAYS);
}

export type UsageDeviceSelection = {
  activeDeviceIds: string[];
  includeLocal: boolean;
  selectedImportedDevices: UsageDevice[];
};

export function selectUsageDevices(
  filter: UsageDeviceFilter,
  importedDevices: UsageDevice[]
): UsageDeviceSelection {
  const importedIds = new Set(importedDevices.map((device) => device.id));
  const normalizedFilter =
    filter === "local" || importedIds.has(filter) ? filter : "all";
  const includeLocal = normalizedFilter === "all" || normalizedFilter === "local";
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
