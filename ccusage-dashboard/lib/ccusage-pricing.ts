import { mkdtemp, readFile, rmdir, unlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { hasPricedCodexModel, hasPricingKey } from "./usage-pricing";
import type { LocalUsageReport, UsageSource } from "./usage-types";

// This release cannot configure a per-model context threshold or Ultrafast.
// The overrides supply the official base USD rates without the wrong 200K tier.
const baseRates = {
  "gpt-6.2-astra": {
    inputCostPerToken: 0.000008,
    cacheReadInputTokenCost: 0.0000004,
    cacheCreationInputTokenCost: 0.00001,
    outputCostPerToken: 0.00004,
    fastMultiplier: 2,
  },
  "gpt-6.2-sol": {
    inputCostPerToken: 0.000002,
    cacheReadInputTokenCost: 0.0000001,
    cacheCreationInputTokenCost: 0.0000025,
    outputCostPerToken: 0.00001,
    fastMultiplier: 2,
  },
};

export const codexPricingReference = {
  source: "https://developers.openai.com/api/docs/pricing",
  checkedAt: "2026-11-18",
  currency: "USD",
  basis:
    "本机 Codex 的 GPT-6.2 按官方基础费率估算，Fast 按 2 倍计。不含超过 272K 输入的长上下文、Ultrafast 或延长缓存时长的附加费。",
} as const;

type Report = "daily" | "session";
type SupplementedModels = Record<Report, string[]>;

export function describeCodexPricing(
  source: UsageSource,
  { daily, sessions }: Pick<LocalUsageReport, "daily" | "sessions">,
  supplementedModels: SupplementedModels,
) {
  const sessionModels = supplementedModels.session.filter((model) =>
    sessions.some((session) => hasPricedCodexModel(session, source, model)),
  );
  const dailyModels = supplementedModels.daily.filter((model) =>
    daily.some(
      (day) =>
        day.costUSD > 0 &&
        Object.entries(day.models).some(
          ([name, usage]) =>
            usage.totalTokens > 0 &&
            !usage.missingPricing &&
            !day.unpricedModels?.includes(name) &&
            hasPricingKey(name, model) &&
            // Unified rows can include same-named models from other Agents.
            (source === "codex" || sessionModels.includes(model)),
        ),
    ),
  );
  return dailyModels.length || sessionModels.length
    ? { ...codexPricingReference, dailyModels, sessionModels }
    : undefined;
}

type Config = Record<string, unknown>;
type ConfigSelection = {
  path?: string;
  supplementedModels: SupplementedModels;
};

function asObject(value: unknown): Config {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Config)
    : {};
}

// Match config discovery in the pinned native reader. It uses the first
// readable JSON object, so passing a standalone price file would mask settings.
async function readEffectiveConfig(cwd: string): Promise<Config> {
  const { HOME, USERPROFILE, HOMEDRIVE, HOMEPATH, CLAUDE_CONFIG_DIR } =
    process.env;
  const profileDir =
    HOME || USERPROFILE || (HOMEDRIVE && HOMEPATH ? HOMEDRIVE + HOMEPATH : "");
  const userDirs =
    CLAUDE_CONFIG_DIR !== undefined
      ? CLAUDE_CONFIG_DIR.split(",")
          .map((path) => path.trim())
          .filter(Boolean)
      : profileDir
        ? [join(profileDir, ".config", "claude"), join(profileDir, ".claude")]
        : [];
  for (const directory of [join(cwd, ".ccusage"), ...userDirs]) {
    try {
      const path = join(directory, "ccusage.json");
      const value: unknown = JSON.parse(
        await readFile(/* turbopackIgnore: true */ path, "utf8"),
      );
      if (value && typeof value === "object" && !Array.isArray(value))
        return value as Config;
    } catch {
      // The native lookup skips missing, unreadable and invalid candidates.
    }
  }
  return {};
}

export async function withCodexPricing<T>(
  {
    source,
    version,
    cwd = process.cwd(),
  }: { source: UsageSource; version: string; cwd?: string },
  read: (config: ConfigSelection) => Promise<T>,
): Promise<T> {
  const empty = () => read({ supplementedModels: { daily: [], session: [] } });
  if (version !== "20.0.51" || (source !== "codex" && source !== "all"))
    return empty();

  const config = await readEffectiveConfig(cwd);
  const codex = asObject(config.codex);
  const topCommands = asObject(config.commands);
  const codexCommands = { ...asObject(codex.commands) };
  const supplementedModels: SupplementedModels = { daily: [], session: [] };
  // Unified "daily --sections daily,session" uses daily settings for both sections.
  const reports: Report[] = source === "all" ? ["daily"] : ["daily", "session"];
  for (const report of reports) {
    const command = asObject(codexCommands[report]);
    const options = [
      config.defaults,
      topCommands[report],
      topCommands[`codex ${report}`],
      topCommands[`codex:${report}`],
      codex.defaults,
      command,
    ];
    const keys = options.flatMap((settings) =>
      Object.keys(asObject(asObject(settings).pricingOverrides)),
    );
    const prices = Object.entries(baseRates).filter(
      ([model]) =>
        !keys.some(
          (key) => hasPricingKey(model, key) || hasPricingKey(key, model),
        ),
    );
    if (!prices.length) continue;
    codexCommands[report] = {
      ...command,
      pricingOverrides: {
        ...asObject(command.pricingOverrides),
        ...Object.fromEntries(prices),
      },
    };
    supplementedModels[report] = prices.map(([model]) => model);
  }
  if (source === "all") supplementedModels.session = supplementedModels.daily;
  if (!supplementedModels.daily.length && !supplementedModels.session.length)
    return empty();

  let directory: string | undefined;
  let path: string | undefined;
  const cleanup = async () => {
    if (path) await unlink(path).catch(() => {});
    if (directory) await rmdir(directory).catch(() => {});
  };
  try {
    directory = await mkdtemp(join(tmpdir(), "token-atlas-ccusage-"));
    path = join(directory, "ccusage.json");
    await writeFile(
      path,
      JSON.stringify({
        ...config,
        codex: { ...codex, commands: codexCommands },
      }),
      { encoding: "utf8", flag: "wx", mode: 0o600 },
    );
  } catch {
    // A temporary-file failure must not prevent the unmodified reader from running.
    await cleanup();
    return empty();
  }
  try {
    return await read({ path, supplementedModels });
  } finally {
    await cleanup();
  }
}
