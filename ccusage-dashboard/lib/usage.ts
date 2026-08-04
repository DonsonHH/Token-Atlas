import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

const MAX_BUFFER = 24 * 1024 * 1024;
const SUPPORTED_DAYS = new Set([7, 14, 30, 90]);

export type UsageSource = "codex" | "all";

export type UsageTotals = {
  cacheCreationTokens: number;
  cacheReadTokens: number;
  costUSD: number;
  inputTokens: number;
  outputTokens: number;
  reasoningOutputTokens: number;
  totalTokens: number;
};

export type UsagePeriod = UsageTotals & {
  label: string;
  models: Record<string, UsageTotals & { isFallback?: boolean }>;
};

export type UsageSession = UsageTotals & {
  id: string;
  lastActivity: string | null;
  models: string[];
  project: string | null;
};

export type UsageModel = UsageTotals & {
  isFallback: boolean;
  name: string;
};

export type UsageSnapshot = {
  daily: UsagePeriod[];
  dataPath: string;
  generatedAt: string;
  mode: "live";
  models: UsageModel[];
  monthly: UsagePeriod[];
  offline: true;
  raw: Record<string, unknown>;
  reader: "ccusage";
  sessions: UsageSession[];
  source: UsageSource;
  totals: UsageTotals;
  weekly: UsagePeriod[];
  weeklyMethod: "ccusage" | "daily-derived";
};

type UnknownRecord = Record<string, unknown>;

const EMPTY_TOTALS: UsageTotals = {
  cacheCreationTokens: 0,
  cacheReadTokens: 0,
  costUSD: 0,
  inputTokens: 0,
  outputTokens: 0,
  reasoningOutputTokens: 0,
  totalTokens: 0,
};

function asRecord(value: unknown): UnknownRecord {
  return typeof value === "object" && value !== null
    ? (value as UnknownRecord)
    : {};
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function asNumber(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function asString(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function totalsFrom(value: unknown): UsageTotals {
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

function addTotals(left: UsageTotals, right: UsageTotals): UsageTotals {
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

function modelMap(value: unknown, fallback: unknown = []): Record<
  string,
  UsageTotals & { isFallback?: boolean }
> {
  const directModels = Object.entries(asRecord(value));

  if (directModels.length > 0) {
    return Object.fromEntries(
      directModels.map(([name, model]) => {
        const rawModel = asRecord(model);

        return [
          name,
          {
            ...totalsFrom(rawModel),
            isFallback: rawModel.isFallback === true,
          },
        ];
      })
    );
  }

  return Object.fromEntries(
    asArray(fallback)
      .map((model) => {
        const rawModel = asRecord(model);
        const name = asString(rawModel.modelName);
        return name
          ? [name, totalsFrom(rawModel)]
          : null;
      })
      .filter((entry): entry is [string, UsageTotals] => entry !== null)
  );
}

function periodsFrom(report: unknown, key: string): UsagePeriod[] {
  return asArray(asRecord(report)[key])
    .map((entry) => {
      const record = asRecord(entry);

      return {
        ...totalsFrom(record),
        label: periodLabel(record),
        models: modelMap(record.models, record.modelBreakdowns),
      };
    })
    .sort((left, right) => left.label.localeCompare(right.label));
}

function sessionsFrom(report: unknown): UsageSession[] {
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
        ...totalsFrom(record),
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

function modelsFrom(periods: UsagePeriod[]): UsageModel[] {
  const models = new Map<string, UsageModel>();

  for (const period of periods) {
    for (const [name, usage] of Object.entries(period.models)) {
      const previous = models.get(name);
      models.set(name, {
        ...(previous ? addTotals(previous, usage) : usage),
        isFallback: Boolean(previous?.isFallback || usage.isFallback),
        name,
      });
    }
  }

  return [...models.values()].sort(
    (left, right) => right.totalTokens - left.totalTokens
  );
}

function totalFor(report: unknown, fallback: UsagePeriod[]): UsageTotals {
  const total = totalsFrom(asRecord(report).totals);
  if (total.totalTokens > 0) {
    return total;
  }

  return fallback.reduce(addTotals, EMPTY_TOTALS);
}

function addModelMaps(
  left: UsagePeriod["models"],
  right: UsagePeriod["models"]
): UsagePeriod["models"] {
  const combined = { ...left };

  for (const [name, usage] of Object.entries(right)) {
    const previous = combined[name];
    combined[name] = {
      ...(previous ? addTotals(previous, usage) : usage),
      isFallback: Boolean(previous?.isFallback || usage.isFallback),
    };
  }

  return combined;
}

function isoWeekStart(label: string): string {
  const date = new Date(`${label}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime())) return label;

  const weekday = date.getUTCDay();
  const daysSinceMonday = (weekday + 6) % 7;
  date.setUTCDate(date.getUTCDate() - daysSinceMonday);
  return date.toISOString().slice(0, 10);
}

function weeklyFromDaily(daily: UsagePeriod[]): UsagePeriod[] {
  const periods = new Map<string, UsagePeriod>();

  for (const day of daily) {
    const label = isoWeekStart(day.label);
    const previous = periods.get(label);
    periods.set(label, {
      ...(previous ? addTotals(previous, day) : day),
      label,
      models: previous ? addModelMaps(previous.models, day.models) : day.models,
    });
  }

  return [...periods.values()].sort((left, right) =>
    left.label.localeCompare(right.label)
  );
}

async function runCcusage(args: string[]): Promise<unknown> {
  const cliPath = join(process.cwd(), "node_modules", "ccusage", "src", "cli.js");

  if (!existsSync(cliPath)) {
    throw new Error("未找到本地 ccusage 依赖。请先运行 pnpm install。");
  }

  const { stdout } = await execFileAsync(process.execPath, [cliPath, ...args], {
    cwd: process.cwd(),
    encoding: "utf8",
    env: { ...process.env, NO_COLOR: "1" },
    maxBuffer: MAX_BUFFER,
    timeout: 60_000,
    windowsHide: true,
  });

  return JSON.parse(stdout) as unknown;
}

export function normalizeDays(days: number): number {
  return SUPPORTED_DAYS.has(days) ? days : 14;
}

export async function readUsageSnapshot({
  days,
  source,
}: {
  days: number;
  source: UsageSource;
}): Promise<UsageSnapshot> {
  const rangeDays = normalizeDays(days);
  const namespace = source === "codex" ? ["codex"] : [];
  const common = ["--json", "--offline"];
  const [dailyRaw, monthlyRaw, sessionsRaw] = await Promise.all([
    runCcusage([...namespace, "daily", ...common, "--last", String(rangeDays)]),
    runCcusage([...namespace, "monthly", ...common, "--last", "12"]),
    runCcusage([...namespace, "session", ...common]),
  ]);

  const daily = periodsFrom(dailyRaw, "daily");
  const monthly = periodsFrom(monthlyRaw, "monthly");
  const weeklyRaw =
    source === "all"
      ? await runCcusage([...namespace, "weekly", ...common, "--last", "12"])
      : { derivedFrom: "ccusage codex daily", weekly: weeklyFromDaily(daily) };
  const weekly =
    source === "all" ? periodsFrom(weeklyRaw, "weekly") : weeklyFromDaily(daily);

  return {
    daily,
    dataPath: process.env.CODEX_HOME ?? "~/.codex",
    generatedAt: new Date().toISOString(),
    mode: "live",
    models: modelsFrom(daily),
    monthly,
    offline: true,
    raw: {
      daily: dailyRaw,
      monthly: monthlyRaw,
      sessions: sessionsRaw,
      weekly: weeklyRaw,
    },
    reader: "ccusage",
    sessions: sessionsFrom(sessionsRaw),
    source,
    totals: totalFor(dailyRaw, daily),
    weekly,
    weeklyMethod: source === "all" ? "ccusage" : "daily-derived",
  };
}
