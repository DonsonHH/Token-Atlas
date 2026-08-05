import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { promisify } from "node:util";

import {
  addUsageTotals,
  createEmptyTotals,
  latestUsageLabel,
  mergeUsagePeriods,
  monthlyUsagePeriods,
  normalizeUsageDays,
  recentUsagePeriods,
  selectUsageDevices,
  usagePeriodsInRange,
  usageModelsFrom,
  usagePeriodsFrom,
  usageSessionsFrom,
  weeklyUsagePeriods,
} from "./usage-domain";
import { readImportedUsage } from "./usage-imports";
import type {
  UsageDevice,
  UsageDeviceFilter,
  UsageSnapshot,
  UsageSource,
} from "./usage-types";
import { usageSourceOptions } from "./usage-types";

const execFileAsync = promisify(execFile);
const MAX_BUFFER = 24 * 1024 * 1024;

export type {
  UsageDevice,
  UsageDeviceFilter,
  UsageModel,
  UsagePeriod,
  UsageSession,
  UsageSnapshot,
  UsageSource,
  UsageTotals,
} from "./usage-types";

export { normalizeUsageDays as normalizeDays } from "./usage-domain";
export { usageSourceLabel, usageSourceOptions } from "./usage-types";

type LocalReports = {
  dailyRaw: unknown;
  monthlyRaw: unknown | null;
  sessionsRaw: unknown | null;
};

function ccusageCommandArgs(
  source: UsageSource,
  command: string,
  extraArgs: string[]
): string[] {
  const namespace = usageSourceOptions.find((option) => option.value === source)?.command;
  return [...(namespace ? [namespace] : []), command, "--json", "--offline", ...extraArgs];
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

  try {
    return JSON.parse(stdout) as unknown;
  } catch {
    throw new Error("ccusage 未返回可解析的 JSON 数据。");
  }
}

async function readOptionalCcusage(
  label: string,
  args: string[]
): Promise<unknown | null> {
  try {
    return await runCcusage(args);
  } catch (error) {
    console.warn("Unable to read ccusage " + label + "; using derived data.", error);
    return null;
  }
}

async function readLocalReports(
  source: UsageSource,
  days: number
): Promise<LocalReports> {
  const dailyRaw = await runCcusage(
    ccusageCommandArgs(source, "daily", ["--last", String(days)])
  );
  const [monthlyRaw, sessionsRaw] = await Promise.all([
    readOptionalCcusage(
      "monthly report",
      ccusageCommandArgs(source, "monthly", ["--last", "12"])
    ),
    readOptionalCcusage(
      "session report",
      ccusageCommandArgs(source, "session", [])
    ),
  ]);

  return { dailyRaw, monthlyRaw, sessionsRaw };
}

function localDeviceFrom(daily: ReturnType<typeof usagePeriodsFrom>): UsageDevice {
  return {
    dailyEntries: daily.length,
    id: "local",
    kind: "local",
    latestDate: latestUsageLabel(daily),
    name: "本机",
    source: "all",
    updatedAt: new Date().toISOString(),
  };
}

export async function readUsageSnapshot({
  days,
  device,
  endDate,
  source,
  startDate,
}: {
  days: number;
  device: UsageDeviceFilter;
  endDate?: string;
  source: UsageSource;
  startDate?: string;
}): Promise<UsageSnapshot> {
  const rangeDays = normalizeUsageDays(days);
  const imported = readImportedUsage();
  const selection = selectUsageDevices(device, imported.devices);
  const localReports = selection.includeLocal
    ? await readLocalReports(source, rangeDays)
    : null;
  const localDaily = localReports
    ? usagePeriodsFrom(localReports.dailyRaw, "daily")
    : [];
  const selectedImportedDevices = selection.selectedImportedDevices.filter(
    (item) => source === "all" || item.source === "all" || item.source === source
  );
  const selectedImportedDaily = selectedImportedDevices.flatMap(
    (item) => imported.dailyByDevice[item.id] ?? []
  );
  const importedDaily = recentUsagePeriods(selectedImportedDaily, rangeDays);
  const daily = usagePeriodsInRange(
    mergeUsagePeriods(selection.includeLocal ? localDaily : [], importedDaily),
    startDate,
    endDate
  );
  const monthly = monthlyUsagePeriods(daily);

  let weekly = weeklyUsagePeriods(daily);
  let weeklyMethod: UsageSnapshot["weeklyMethod"] = "daily-derived";
  let weeklyRaw: unknown = {
    derivedFrom: "daily usage aggregation",
    weekly,
  };

  if (selection.includeLocal && !startDate && !endDate) {
    const cliWeeklyRaw = await readOptionalCcusage(
      "weekly report",
      ccusageCommandArgs(source, "weekly", ["--last", "12"])
    );
    const localWeekly = cliWeeklyRaw
      ? usagePeriodsFrom(cliWeeklyRaw, "weekly")
      : [];

    if (localWeekly.length) {
      weekly = mergeUsagePeriods(localWeekly, weeklyUsagePeriods(importedDaily));
      weeklyMethod = "ccusage";
      weeklyRaw = cliWeeklyRaw;
    }
  }

  const localDevice = localDeviceFrom(localDaily);
  const importedRaw = Object.fromEntries(
    selectedImportedDevices.map((item) => [
      item.id,
      imported.raw[item.id],
    ])
  );

  return {
    activeDeviceIds: [
      ...(selection.includeLocal ? ["local"] : []),
      ...selectedImportedDevices.map((item) => item.id),
    ],
    daily,
    dataPath: source === "codex" ? process.env.CODEX_HOME ?? "~/.codex" : "ccusage detected local sources",
    devices: [localDevice, ...imported.devices],
    generatedAt: new Date().toISOString(),
    mode: "live",
    models: usageModelsFrom(daily),
    monthly,
    offline: true,
    raw: {
      daily:
        localReports?.dailyRaw ?? {
          skipped: "The local device was not selected.",
        },
      imported: importedRaw,
      monthly: { derivedFrom: "daily usage aggregation", monthly },
      sessions:
        localReports?.sessionsRaw ?? {
          skipped: "The local device was not selected.",
        },
      weekly: weeklyRaw,
    },
    reader: "ccusage",
    sessions: localReports?.sessionsRaw
      ? usageSessionsFrom(localReports.sessionsRaw)
      : [],
    source,
    totals: daily.reduce(addUsageTotals, createEmptyTotals()),
    weekly,
    weeklyMethod,
  };
}
