import {
  selectUsageDevices,
  usagePeriodsFrom,
  usageSessionsFrom,
} from "./usage-domain";
import { readImportedUsage } from "./usage-imports";
import {
  assembleUsageSnapshot,
  combineLocalUsageReports,
} from "./usage-snapshot";
import { readDshUsage } from "./dsh-usage";
import { readCcusageReport } from "./ccusage-reader";
import type { UsageSource } from "./usage-types";
import type { UsageRange } from "./usage-range";
import ccusagePackage from "ccusage/package.json";
import type { LocalUsageReport } from "./usage-types";

export type * from "./usage-types";

export async function readUsageSnapshot({
  range,
  device,
  source,
}: {
  range: UsageRange;
  device: string;
  source: UsageSource;
}) {
  const imports = readImportedUsage();
  const selection = selectUsageDevices(device, imports.devices);
  let dshDetected = false;
  async function readNative(): Promise<LocalUsageReport> {
    if (source === "all") {
      try {
        const report = await readCcusageReport(source, "daily", range);
        return {
          daily: usagePeriodsFrom(report, "daily"),
          sessions: usageSessionsFrom(report),
        };
      } catch {
        return {
          daily: [],
          sessions: [],
          error: "本机用量读取失败；请检查 ccusage 和本地日志。",
        };
      }
    }
    const [days, sessions] = await Promise.allSettled([
      readCcusageReport(source, "daily", range),
      readCcusageReport(source, "session", range),
    ]);
    return {
      daily:
        days.status === "fulfilled"
          ? usagePeriodsFrom(days.value, "daily")
          : [],
      sessions:
        sessions.status === "fulfilled"
          ? usageSessionsFrom(sessions.value)
          : [],
      ...(days.status === "rejected"
        ? { error: "本机用量读取失败；请检查 ccusage 和本地日志。" }
        : {}),
      ...(sessions.status === "rejected"
        ? { sessionError: "本机会话读取失败，请重试。" }
        : {}),
    };
  }
  const local = !selection.includeLocal
    ? null
    : source === "dsh"
      ? await readDshUsage(range)
      : source === "all"
        ? await (async () => {
            const [native, dsh] = await Promise.all([
              readNative(),
              readDshUsage(range),
            ]);
            dshDetected = dsh.detected;
            return combineLocalUsageReports(
              dsh.detected ? [native, dsh] : [native],
            );
          })()
        : await readNative();
  const snapshot = assembleUsageSnapshot({
    range,
    device,
    source,
    imports,
    local,
  });
  return {
    ...snapshot,
    reader:
      source === "dsh"
        ? ("dsh" as const)
        : dshDetected
          ? ("ccusage+dsh" as const)
          : ("ccusage" as const),
    readerVersion: source === "dsh" ? undefined : ccusagePackage.version,
  };
}
