import { readFile, stat } from "node:fs/promises";
import { basename, dirname, join, resolve } from "node:path";

type Config = Record<string, unknown>;
type Report = "daily" | "session";

function object(value: unknown): Config {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Config)
    : {};
}

function matchingKey(value: string) {
  return value.trim().toLowerCase().replace(/[.@]/g, "-");
}

function aliasedModels(value = ""): string[] {
  try {
    return Object.entries(object(JSON.parse(value))).flatMap(
      ([model, target]) =>
        typeof target === "string" && target.trim() ? [model] : [],
    );
  } catch {
    return value.split(/[,;\n]/).flatMap((pair) => {
      const equals = pair.indexOf("=");
      return equals > 0 && pair.slice(equals + 1).trim()
        ? [pair.slice(0, equals)]
        : [];
    });
  }
}

// Native discovery uses the first readable JSON object, including project and
// user settings. Do not replace a config the native reader cannot access.
async function effectiveConfig(cwd: string, env: NodeJS.ProcessEnv) {
  const {
    HOME,
    USERPROFILE,
    HOMEDRIVE,
    HOMEPATH,
    XDG_CONFIG_HOME,
    CLAUDE_CONFIG_DIR,
  } = env;
  const profile =
    HOME || USERPROFILE || (HOMEDRIVE && HOMEPATH ? HOMEDRIVE + HOMEPATH : "");
  const configHome =
    XDG_CONFIG_HOME || (profile ? join(profile, ".config") : "");
  const paths =
    CLAUDE_CONFIG_DIR !== undefined
      ? CLAUDE_CONFIG_DIR.split(",")
          .map((item) => item.trim())
          .filter(Boolean)
      : [
          ...(configHome ? [join(configHome, "claude")] : []),
          ...(profile ? [join(profile, ".claude")] : []),
        ];
  for (const dir of [join(cwd, ".ccusage"), ...paths]) {
    const expanded =
      profile && (dir === "~" || dir.startsWith("~/"))
        ? join(profile, dir.slice(2))
        : dir;
    const path = resolve(cwd, expanded);
    const configDir =
      basename(path) === "projects" &&
      (await stat(path).catch(() => undefined))?.isDirectory()
        ? dirname(path)
        : path;
    try {
      const value: unknown = JSON.parse(
        await readFile(
          /* turbopackIgnore: true */ join(configDir, "ccusage.json"),
          "utf8",
        ),
      );
      if (value && typeof value === "object" && !Array.isArray(value))
        return object(value);
    } catch (error) {
      if (
        !(error instanceof SyntaxError) &&
        (error as NodeJS.ErrnoException).code !== "ENOENT"
      )
        return undefined;
    }
  }
  return {};
}

/** Fill only the missing Fast multiplier, leaving the published token rates and tiers intact. */
export async function codexFastConfig(
  report: Report,
  cwd: string,
  env: NodeJS.ProcessEnv,
) {
  const config = await effectiveConfig(cwd, env);
  if (!config) return undefined;
  const codex = object(config.codex);
  const topCommands = object(config.commands);
  const commands = object(codex.commands);
  const reportSettings = object(commands[report]);
  const layers = [
    config.defaults,
    topCommands[report],
    topCommands["codex " + report],
    topCommands["codex:" + report],
    codex.defaults,
    reportSettings,
  ];
  const explicit = new Set(
    [
      ...aliasedModels(env.CCUSAGE_MODEL_ALIASES),
      ...layers.flatMap((layer) =>
        Object.keys(object(object(layer).pricingOverrides)),
      ),
    ].map(matchingKey),
  );
  const prices = ["gpt-6.2-astra", "gpt-6.2-sol"].filter(
    (model) => !explicit.has(matchingKey(model)),
  );
  if (!prices.length) return undefined;
  return {
    ...config,
    codex: {
      ...codex,
      commands: {
        ...commands,
        [report]: {
          ...reportSettings,
          pricingOverrides: {
            ...object(reportSettings.pricingOverrides),
            ...Object.fromEntries(
              prices.map((model) => [model, { fastMultiplier: 2 }]),
            ),
          },
        },
      },
    },
  };
}
