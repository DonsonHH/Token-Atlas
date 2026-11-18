import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { promisify } from "node:util";
import test from "node:test";
import { usagePeriodsFrom, usageSessionsFrom } from "../lib/usage-domain";
import { assembleUsageSnapshot } from "../lib/usage-snapshot";
import { resolveUsageRange } from "../lib/usage-range";
import { describeCodexPricing, withCodexPricing } from "../lib/ccusage-pricing";
import {
  buildUsageViewExport,
  usagePricingMetadata,
} from "../lib/usage-export";
import { validateUsageImport } from "../lib/usage-import-validation";
import ccusagePackage from "ccusage/package.json";

const exec = promisify(execFile);
const cli = resolve("node_modules/ccusage/src/cli.js");
const timestamp = "2026-07-10T00:00:00Z";
const plain =
  [
    { timestamp, type: "turn_context", payload: { model: "gpt-5" } },
    {
      timestamp,
      type: "event_msg",
      payload: {
        type: "token_count",
        info: {
          total_token_usage: {
            input_tokens: 100,
            cached_input_tokens: 80,
            output_tokens: 20,
            total_tokens: 120,
          },
        },
      },
    },
  ]
    .map((row) => JSON.stringify(row))
    .join("\n") + "\n";

// The same synthetic 120-token rollout, Zstandard encoded. Keeping a tiny
// fixture avoids requiring Node's experimental Zstd API or a system utility.
const compressed = Buffer.from(
  "KLUv/WAhAAUFAELJHRxwiXN1ZUSClIQL/miQjchwVY8UgIrEiaXq0wcTRowxZkKZGvJRDpSyh2QlR5mI/jV0jdllPaia1dxsaEyDi+DlMdVtFWvEeMDRbrm+WYXZH72yuHGWO3ovthsnqiVgX7/O6aMXNJOQyCHII5AyXe/Y6reM6T8BDgBCBOAK3LDJGT1lBfhw2vczkMbINwbOMQyOBLhQPpaGDUTBOQE=",
  "base64",
);
// A distinct event at 00:01, so cross-session event deduplication cannot mask
// whether both active and archived compressed files have been discovered.
const archivedCompressed = Buffer.from(
  "KLUv/WAhAP0EAJJJHhxwiXN1ZUSClIQL/miQjchwVY8UgIrEiaXq0wcTRowxZkKZGvJRDpSyh2QlR5mI/jV0jdllPaia1dxsaEyDi+DlMdVtFWvEeMDRbrm+WYXZH72yuHGWO3ovthsnqiVgX7/O6aMXMhVJzSQkcgjyCKRM1zu2+i1j+k8NAEIE4ArcsMkZPWUF+HDa9zOQxsg3Bs4xDI4EuFC+K83EZg==",
  "base64",
);

async function writeRollout(
  home: string,
  path: string,
  content: string | Buffer,
) {
  const target = join(home, path);
  await mkdir(dirname(target), { recursive: true });
  await writeFile(target, content);
}

async function readReport(
  home: string,
  command: string,
  bounds: string[] = [],
  unified = false,
) {
  const { stdout } = await exec(
    process.execPath,
    [
      cli,
      ...(unified ? [] : ["codex"]),
      command,
      "--json",
      "--offline",
      "--timezone",
      "Asia/Shanghai",
      ...bounds,
      ...(unified ? ["--sections", "daily,session"] : []),
    ],
    {
      // Do not inherit adapter-specific log roots from the test runner.
      cwd: home,
      env: {
        NODE_ENV: "test",
        SystemRoot: process.env.SystemRoot,
        CODEX_HOME: home,
        HOME: home,
        USERPROFILE: home,
        APPDATA: join(home, "appdata"),
        LOCALAPPDATA: join(home, "localappdata"),
        XDG_CONFIG_HOME: join(home, "config"),
        XDG_DATA_HOME: join(home, "data"),
        NO_COLOR: "1",
      },
      windowsHide: true,
      timeout: 15_000,
      maxBuffer: 1024 * 1024,
    },
  );
  return JSON.parse(stdout) as unknown;
}

async function removeFixture(home: string) {
  assert.equal(dirname(home), resolve(tmpdir()));
  assert.ok(basename(home).startsWith("token-atlas-codex-test-"));
  await rm(home, { recursive: true, force: true });
}

test("shipped ccusage reads compressed active and archived history through report normalization", async () => {
  const home = await mkdtemp(join(tmpdir(), "token-atlas-codex-test-"));
  try {
    await writeRollout(
      home,
      "sessions/2026/07/10/plain.jsonl",
      plain.replaceAll(timestamp, "2026-07-10T00:02:00Z"),
    );
    await writeRollout(
      home,
      "sessions/2026/07/10/active.jsonl.zst",
      compressed,
    );
    await writeRollout(
      home,
      "archived_sessions/archived.jsonl.zst",
      archivedCompressed,
    );
    const daily = usagePeriodsFrom(await readReport(home, "daily"), "daily");
    const sessions = usageSessionsFrom(await readReport(home, "session"));
    const combined = await readReport(home, "daily", [], true);
    assert.equal(
      usagePeriodsFrom(combined, "daily").reduce(
        (sum, row) => sum + row.totalTokens,
        0,
      ),
      360,
      "the workspace's unified daily/section reader must also include compressed logs",
    );
    assert.equal(
      usageSessionsFrom(combined).reduce(
        (sum, row) => sum + row.totalTokens,
        0,
      ),
      360,
    );
    const snapshot = assembleUsageSnapshot({
      range: resolveUsageRange(
        { days: "all", timezone: "Asia/Shanghai" },
        new Date("2026-10-22T12:00:00Z"),
      ),
      source: "codex",
      device: "local",
      local: { daily, sessions },
      imports: { devices: [], dailyByDevice: {}, warnings: [] },
    });
    assert.equal(
      snapshot.totals.totalTokens,
      360,
      "compressed logs must not disappear from all-history totals",
    );
    assert.equal(snapshot.range.start, "2026-07-10");
    assert.equal(snapshot.sessions.length, 3);
    assert.equal(
      snapshot.sessions.reduce((sum, row) => sum + row.totalTokens, 0),
      360,
    );
    for (const rows of [
      snapshot.daily,
      snapshot.weekly,
      snapshot.monthly,
      snapshot.models,
    ]) {
      assert.equal(
        rows.reduce((sum, row) => sum + row.totalTokens, 0),
        360,
      );
    }
  } finally {
    await removeFixture(home);
  }
});

test("plain and compressed copies, including archived duplicates, are counted once", async () => {
  const home = await mkdtemp(join(tmpdir(), "token-atlas-codex-test-"));
  try {
    const relative = "2026/07/10/same-rollout.jsonl";
    await writeRollout(home, `sessions/${relative}`, plain);
    await writeRollout(home, `sessions/${relative}.zst`, archivedCompressed);
    await writeRollout(
      home,
      `archived_sessions/${relative}.zst`,
      archivedCompressed,
    );
    const days = usagePeriodsFrom(await readReport(home, "daily"), "daily");
    assert.equal(
      days.reduce((sum, row) => sum + row.totalTokens, 0),
      120,
    );
  } finally {
    await removeFixture(home);
  }
});

test("an active compressed rollout takes precedence over its stale archived plain copy", async () => {
  const home = await mkdtemp(join(tmpdir(), "token-atlas-codex-test-"));
  try {
    const relative = "2026/07/10/same-rollout.jsonl";
    await writeRollout(home, `sessions/${relative}.zst`, compressed);
    const stale = plain
      .replaceAll(timestamp, "2026-07-10T00:02:00Z")
      .replace('"input_tokens":100', '"input_tokens":500')
      .replace('"total_tokens":120', '"total_tokens":520');
    await writeRollout(home, `archived_sessions/${relative}`, stale);
    const days = usagePeriodsFrom(await readReport(home, "daily"), "daily");
    assert.equal(
      days.reduce((sum, row) => sum + row.totalTokens, 0),
      120,
    );
  } finally {
    await removeFixture(home);
  }
});

test("compressed history respects inclusive custom dates without being omitted", async () => {
  const home = await mkdtemp(join(tmpdir(), "token-atlas-codex-test-"));
  try {
    await writeRollout(
      home,
      "sessions/2026/07/10/history.jsonl.zst",
      compressed,
    );
    const included = usagePeriodsFrom(
      await readReport(home, "daily", [
        "--since",
        "2026-07-10",
        "--until",
        "2026-07-10",
      ]),
      "daily",
    );
    assert.equal(
      included.reduce((sum, row) => sum + row.totalTokens, 0),
      120,
    );
    const excluded = usagePeriodsFrom(
      await readReport(home, "daily", [
        "--since",
        "2026-07-11",
        "--until",
        "2026-07-11",
      ]),
      "daily",
    );
    assert.equal(excluded.length, 0);
  } finally {
    await removeFixture(home);
  }
});

test("Jetson export and the installed reader use the same pinned version", async () => {
  const project = JSON.parse(await readFile(resolve("package.json"), "utf8"));
  const installed = JSON.parse(
    await readFile(resolve("node_modules/ccusage/package.json"), "utf8"),
  );
  const script = await readFile(
    resolve("scripts/export-jetson-usage.sh"),
    "utf8",
  );
  assert.equal(installed.version, project.dependencies.ccusage);
  assert.ok(script.includes(`ccusage_version="${installed.version}"`));
});

test("ccusage prices GPT-6.2 Astra and Sol offline in focused and unified reports", async () => {
  const fixtureDir = await mkdtemp(join(tmpdir(), "token-atlas-codex-test-"));
  try {
    await writeRollout(
      fixtureDir,
      "sessions/2026/11/18/astra.jsonl",
      plain
        .replaceAll(timestamp, "2026-11-18T00:00:00Z")
        .replace("gpt-5", "gpt-6.2-astra"),
    );
    const solTier = JSON.stringify({
      timestamp: "2026-11-18T00:00:59Z",
      type: "event_msg",
      payload: {
        type: "thread_settings_applied",
        thread_settings: { service_tier: "priority" },
      },
    });
    await writeRollout(
      fixtureDir,
      "sessions/2026/11/18/sol.jsonl",
      solTier +
        "\n" +
        plain
          .replaceAll(timestamp, "2026-11-18T00:01:00Z")
          .replace("gpt-5", "gpt-6.2-sol"),
    );
    const bounds = ["--since", "2026-11-18", "--until", "2026-11-18"];
    await writeRollout(fixtureDir, ".ccusage/ccusage.json", "{}");
    const [focused, unified, fast] = await withCodexPricing(
      { source: "all", version: ccusagePackage.version, cwd: fixtureDir },
      ({ path }) => {
        const flags = path ? [...bounds, "--config", path] : bounds;
        return Promise.all([
          readReport(fixtureDir, "daily", [...flags, "--speed", "standard"]),
          readReport(fixtureDir, "daily", flags, true),
          readReport(fixtureDir, "daily", [...flags, "--speed", "fast"]),
        ]);
      },
    );
    for (const [report, expected] of [
      [focused, 0.00124],
      [unified, 0.001488],
    ] as const) {
      const [day] = usagePeriodsFrom(report, "daily");
      assert.equal(day.totalTokens, 240);
      assert.equal(day.unpricedModels, undefined);
      // Each request has 20 uncached input, 80 cache reads and 20 output tokens.
      // Unified auto mode charges Sol at the observed Fast rate.
      assert.ok(Math.abs(day.costUSD - expected) < 1e-10);
    }
    const sessions = usageSessionsFrom(unified).sort(
      (a, b) => b.costUSD - a.costUSD,
    );
    assert.deepEqual(
      sessions.map((session) => session.models),
      [["gpt-6.2-astra"], ["gpt-6.2-sol"]],
    );
    assert.ok(Math.abs(sessions[0].costUSD - 0.000992) < 1e-10);
    assert.ok(Math.abs(sessions[1].costUSD - 0.000496) < 1e-10);
    assert.ok(
      Math.abs(usagePeriodsFrom(fast, "daily")[0].costUSD - 0.00248) < 1e-10,
    );

    const modelNames = ["gpt-6.2-astra", "gpt-6.2-sol"];
    const supplemented = { daily: modelNames, session: modelNames };
    const focusedWithoutSessions = {
      daily: usagePeriodsFrom(focused, "daily"),
      sessions: [],
    };
    assert.deepEqual(
      describeCodexPricing("codex", focusedWithoutSessions, supplemented)
        ?.dailyModels,
      modelNames,
    );
    const local = { daily: usagePeriodsFrom(unified, "daily"), sessions };
    const snapshot = {
      ...assembleUsageSnapshot({
        range: resolveUsageRange({ start: "2026-11-18", end: "2026-11-18" }),
        device: "local",
        source: "all",
        local,
        imports: { devices: [], dailyByDevice: {}, warnings: [] },
      }),
      codexPricing: describeCodexPricing("all", local, supplemented),
    };
    const exported = buildUsageViewExport(snapshot, "all");
    assert.equal(snapshot.warnings.length, 0);
    assert.deepEqual(exported.codexPricing?.models, modelNames);
    assert.equal(exported.codexPricing?.basis, snapshot.codexPricing?.basis);
    assert.equal(
      validateUsageImport(exported, "Fixture", "codex").daily[0].costUSD,
      snapshot.totals.costUSD,
    );
    assert.deepEqual(
      usagePricingMetadata(snapshot, [sessions[1]]).codexPricing?.models,
      ["gpt-6.2-sol"],
    );
    assert.equal(usagePricingMetadata(snapshot, []).codexPricing, undefined);
    assert.equal(
      usagePricingMetadata({ ...snapshot, activeDeviceIds: ["external"] })
        .codexPricing,
      undefined,
    );
  } finally {
    await removeFixture(fixtureDir);
  }
});

test("Codex pricing preserves the effective user's settings and explicit model overrides", async () => {
  const fixtureDir = await mkdtemp(join(tmpdir(), "token-atlas-codex-test-"));
  try {
    const original = {
      defaults: {
        timezone: "UTC",
        pricingOverrides: { "gpt-5": { inputCostPerToken: 0.0001 } },
      },
      commands: {
        "codex daily": {
          pricingOverrides: {
            "gpt-6-2-sol": {
              inputCostPerToken: 0.00001,
              cacheReadInputTokenCost: 0.000001,
              outputCostPerToken: 0.00002,
            },
          },
        },
        monthly: {
          pricingOverrides: { "gpt-6.2-astra": { fastMultiplier: 1.5 } },
        },
      },
      codex: { defaults: { speed: "fast" } },
    };
    await writeRollout(
      fixtureDir,
      ".ccusage/ccusage.json",
      JSON.stringify(original),
    );
    await writeRollout(
      fixtureDir,
      "sessions/2026/07/10/sol.jsonl",
      plain.replace("gpt-5", "gpt-6.2-sol"),
    );
    const path = await withCodexPricing(
      { source: "codex", version: "20.0.51", cwd: fixtureDir },
      async ({ path, supplementedModels }) => {
        assert.ok(path);
        assert.deepEqual(supplementedModels, {
          daily: ["gpt-6.2-astra"],
          session: ["gpt-6.2-astra", "gpt-6.2-sol"],
        });
        const config = JSON.parse(await readFile(path, "utf8"));
        assert.deepEqual(config.defaults, original.defaults);
        assert.deepEqual(config.commands, original.commands);
        assert.equal(config.codex.defaults.speed, "fast");
        assert.equal(
          config.codex.commands.daily.pricingOverrides["gpt-6.2-sol"],
          undefined,
        );
        assert.equal(
          config.codex.commands.daily.pricingOverrides["gpt-6.2-astra"]
            .cacheReadInputTokenCost,
          0.0000004,
        );
        const flags = ["--config", path, "--speed", "standard"];
        const [dailyResult, sessionResult] = await Promise.all([
          readReport(fixtureDir, "daily", flags),
          readReport(fixtureDir, "session", flags),
        ]);
        const daily = usagePeriodsFrom(dailyResult, "daily");
        const sessions = usageSessionsFrom(sessionResult);
        assert.ok(Math.abs(daily[0].costUSD - 0.00068) < 1e-10);
        assert.ok(Math.abs(sessions[0].costUSD - 0.000248) < 1e-10);
        const basis = describeCodexPricing(
          "codex",
          { daily, sessions },
          supplementedModels,
        );
        assert.deepEqual(basis?.dailyModels, []);
        assert.deepEqual(basis?.sessionModels, ["gpt-6.2-sol"]);
        return path;
      },
    );
    assert.deepEqual(
      JSON.parse(
        await readFile(join(fixtureDir, ".ccusage", "ccusage.json"), "utf8"),
      ),
      original,
    );
    await assert.rejects(readFile(path), { code: "ENOENT" });
  } finally {
    await removeFixture(fixtureDir);
  }
});
