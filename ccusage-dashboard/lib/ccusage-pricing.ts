import { mkdtemp, readFile, rmdir, unlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { UsageSource } from "./usage-types";

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

type Config = Record<string, unknown>;
type ConfigSelection = { path?: string; supplementedModels: string[] };

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
      const value: unknown = JSON.parse(
        await readFile(join(directory, "ccusage.json"), "utf8"),
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
  if (version !== "20.0.51" || (source !== "codex" && source !== "all"))
    return read({ supplementedModels: [] });

  const config = await readEffectiveConfig(cwd);
  const codex = asObject(config.codex);
  const defaults = asObject(codex.defaults);
  const topCommands = Object.entries(asObject(config.commands)).filter(
    ([key]) => !/[ :]/.test(key) || /^codex[ :]/.test(key),
  );
  const options = [
    config.defaults,
    defaults,
    ...topCommands.map(([, value]) => value),
    ...Object.values(asObject(codex.commands)),
  ];
  // Preserve explicit model overrides even if scoped to a single report.
  const prices = Object.entries(baseRates).filter(([model]) =>
    options.every(
      (value) =>
        !Object.hasOwn(asObject(asObject(value).pricingOverrides), model),
    ),
  );
  if (!prices.length) return read({ supplementedModels: [] });

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
        codex: {
          ...codex,
          defaults: {
            ...defaults,
            pricingOverrides: {
              ...asObject(defaults.pricingOverrides),
              ...Object.fromEntries(prices),
            },
          },
        },
      }),
      { encoding: "utf8", flag: "wx", mode: 0o600 },
    );
  } catch {
    // A temporary-file failure must not prevent the unmodified reader from running.
    await cleanup();
    return read({ supplementedModels: [] });
  }
  try {
    return await read({
      path,
      supplementedModels: prices.map(([model]) => model),
    });
  } finally {
    await cleanup();
  }
}
