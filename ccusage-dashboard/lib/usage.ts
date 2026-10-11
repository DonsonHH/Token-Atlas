import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { promisify } from "node:util";

import {
  selectUsageDevices,
  usagePeriodsFrom,
  usageSessionsFrom,
} from "./usage-domain";
import { readImportedUsage } from "./usage-imports";
import { assembleUsageSnapshot } from "./usage-snapshot";
import { usageSourceOptions, type UsageSource } from "./usage-types";
import type { UsageRange } from "./usage-range";

export type * from "./usage-types";
const execFileAsync = promisify(execFile);

async function runCcusage(
  source: UsageSource,
  command: string,
  range: UsageRange,
  combined = false,
) {
  const cliPath = join(
    process.cwd(),
    "node_modules",
    "ccusage",
    "src",
    "cli.js",
  );
  if (!existsSync(cliPath)) throw new Error("ccusage 未安装");
  const namespace = usageSourceOptions.find(
    (item) => item.value === source,
  )?.command;
  const args = [
    cliPath,
    ...(namespace ? [namespace] : []),
    command,
    "--json",
    "--offline",
    ...(range.allTime ? [] : ["--since", range.start]),
    "--until",
    range.end,
    "--timezone",
    range.timezone,
    ...(combined ? ["--sections", "daily,session"] : []),
  ];
  const { stdout } = await execFileAsync(process.execPath, args, {
    cwd: process.cwd(),
    encoding: "utf8",
    env: { ...process.env, NO_COLOR: "1" },
    maxBuffer: 32 * 1024 * 1024,
    timeout: 60_000,
    windowsHide: true,
  });
  return JSON.parse(stdout) as unknown;
}

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
  const local = selection.includeLocal
    ? await (async () => {
        if (source === "all") {
          try {
            const report = await runCcusage(source, "daily", range, true);
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
          runCcusage(source, "daily", range),
          runCcusage(source, "session", range),
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
      })()
    : null;
  return assembleUsageSnapshot({ range, device, source, imports, local });
}
