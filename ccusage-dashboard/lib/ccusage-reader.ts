import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdtemp, rmdir, unlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import ccusagePackage from "ccusage/package.json";
import { codexFastConfig } from "./ccusage-fast-config";
import type { UsageRange } from "./usage-range";
import { usageSourceOptions, type UsageSource } from "./usage-types";

const exec = promisify(execFile);

export async function readCcusageReport(
  source: UsageSource,
  command: "daily" | "session",
  range: UsageRange,
  {
    cwd = process.cwd(),
    env = process.env,
  }: { cwd?: string; env?: NodeJS.ProcessEnv } = {},
) {
  const cli = join(process.cwd(), "node_modules", "ccusage", "src", "cli.js");
  if (!existsSync(cli)) throw new Error("ccusage 未安装");
  const namespace = usageSourceOptions.find(
    (item) => item.value === source,
  )?.command;
  const args = [
    cli,
    ...(namespace ? [namespace] : []),
    command,
    "--json",
    "--offline",
    ...(range.allTime ? [] : ["--since", range.start]),
    "--until",
    range.end,
    "--timezone",
    range.timezone,
    ...(source === "all" && command === "daily"
      ? ["--sections", "daily,session"]
      : []),
  ];
  const config =
    ccusagePackage.version === "20.1.1" &&
    (source === "all" || source === "codex")
      ? await codexFastConfig(command, cwd, env)
      : undefined;
  const temporary = config
    ? await mkdtemp(join(tmpdir(), "token-atlas-ccusage-")).catch(
        () => undefined,
      )
    : undefined;
  const configFile =
    config && temporary ? join(temporary, "ccusage.json") : undefined;
  try {
    const configPath =
      configFile &&
      (await writeFile(configFile, JSON.stringify(config), {
        encoding: "utf8",
        flag: "wx",
        mode: 0o600,
      }).then(
        () => configFile,
        () => undefined,
      ));
    const run = (path?: string) =>
      exec(process.execPath, [...args, ...(path ? ["--config", path] : [])], {
        cwd,
        encoding: "utf8",
        env: {
          ...env,
          CCUSAGE_TELEMETRY_DISABLED: "1",
          NO_COLOR: "1",
        },
        maxBuffer: 32 * 1024 * 1024,
        timeout: 60_000,
        windowsHide: true,
      });
    const { stdout } = await run(configPath).catch((error: unknown) => {
      // Native auto-discovery can recover a malformed field that --config
      // would reject. Keep the user's working report with native pricing.
      if (
        configPath &&
        error instanceof Error &&
        "code" in error &&
        error.code === 2 &&
        "stderr" in error &&
        typeof error.stderr === "string" &&
        error.stderr.includes(`Invalid ccusage config: ${configPath}:`)
      )
        return run();
      throw error;
    });
    return JSON.parse(stdout) as unknown;
  } finally {
    if (configFile) await unlink(configFile).catch(() => {});
    if (temporary) await rmdir(temporary).catch(() => {});
  }
}
