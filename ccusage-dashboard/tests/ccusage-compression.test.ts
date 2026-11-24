import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { promisify } from "node:util";
import * as zlib from "node:zlib";
import test from "node:test";
import { usagePeriodsFrom, usageSessionsFrom } from "../lib/usage-domain";
import { assembleUsageSnapshot } from "../lib/usage-snapshot";
import { resolveUsageRange } from "../lib/usage-range";
import { readCcusageReport } from "../lib/ccusage-reader";
import { buildUsageViewExport } from "../lib/usage-export";
import { validateUsageImport } from "../lib/usage-import-validation";

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

function fixtureEnvironment(
  home: string,
  modelAliases?: string,
): NodeJS.ProcessEnv {
  return {
    NODE_ENV: "test",
    CCUSAGE_MODEL_ALIASES: modelAliases,
    SystemRoot: process.env.SystemRoot,
    CODEX_HOME: home,
    HOME: home,
    USERPROFILE: home,
    APPDATA: join(home, "appdata"),
    LOCALAPPDATA: join(home, "localappdata"),
    XDG_CONFIG_HOME: join(home, "config"),
    XDG_DATA_HOME: join(home, "data"),
    CCUSAGE_TELEMETRY_DISABLED: "1",
    NO_COLOR: "1",
  };
}

async function readReport(
  home: string,
  command: string,
  bounds: string[] = [],
  unified = false,
  modelAliases?: string,
  namespace = "codex",
) {
  const { stdout } = await exec(
    process.execPath,
    [
      cli,
      ...(unified ? [] : [namespace]),
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
      env: fixtureEnvironment(home, modelAliases),
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

test("focused and unified dashboard reports use native DSH tokens and prices once", async (t) => {
  const home = await mkdtemp(join(tmpdir(), "token-atlas-codex-test-"));
  try {
    await writeRollout(home, "sessions/2026/07/10/codex.jsonl", plain);
    const time = Date.parse(timestamp);
    await writeRollout(
      home,
      ".dsh/sessions/test/session/session.v4.jsonl",
      [
        {
          type: "session",
          version: 4,
          id: "dsh-overlap",
          createdAt: time,
          isSeeded: false,
          cwd: "/fixture",
        },
        {
          type: "request/context",
          seq: 1,
          time,
          data: { provider: "deepseek-official", model: "deepseek-flash" },
        },
        {
          type: "assistant/message",
          seq: 2,
          time,
          data: {
            message: {
              id: "dsh-overlap-msg",
              source: { kind: "model", model: "deepseek-flash" },
            },
            usage: { inputTokens: 15, outputTokens: 5, totalTokens: 20 },
          },
        },
      ]
        .map((row) => JSON.stringify(row))
        .join("\n") + "\n",
    );
    const range = resolveUsageRange({
      start: "2026-07-10",
      end: "2026-07-10",
      timezone: "Asia/Shanghai",
    });
    const dshHome = join(home, ".dsh");
    await writeRollout(
      home,
      ".ccusage/ccusage.json",
      JSON.stringify({
        dsh: {
          defaults: {
            pricingOverrides: {
              "deepseek-flash": {
                inputCostPerToken: 0.00001,
                outputCostPerToken: 0.00002,
              },
            },
          },
        },
      }),
    );
    const options = {
      cwd: home,
      env: { ...fixtureEnvironment(home), DSH_HOME: dshHome },
    };
    const bounds = ["--since", range.start, "--until", range.end];
    const [directDaily, directSessions, directAll] = await Promise.all([
      readReport(home, "daily", bounds, false, undefined, "dsh"),
      readReport(home, "session", bounds, false, undefined, "dsh"),
      readReport(home, "daily", bounds, true),
    ]);
    const [dshDay] = usagePeriodsFrom(directDaily, "daily");
    assert.equal(dshDay.totalTokens, 20);
    assert.equal(+dshDay.costUSD.toFixed(9), 0.00025);
    assert.equal(usageSessionsFrom(directSessions).length, 1);
    assert.equal(usagePeriodsFrom(directAll, "daily")[0].totalTokens, 140);

    const focusedDaily = await readCcusageReport(
      "dsh",
      "daily",
      range,
      options,
    );
    const focusedSessions = await readCcusageReport(
      "dsh",
      "session",
      range,
      options,
    );
    const unified = await readCcusageReport("all", "daily", range, options);
    assert.deepEqual(usagePeriodsFrom(focusedDaily, "daily"), [dshDay]);
    assert.deepEqual(
      usageSessionsFrom(focusedSessions),
      usageSessionsFrom(directSessions),
    );
    assert.deepEqual(
      usagePeriodsFrom(unified, "daily"),
      usagePeriodsFrom(directAll, "daily"),
    );
    assert.equal(
      usageSessionsFrom(unified).filter(({ source }) => source === "dsh")
        .length,
      1,
    );

    t.mock.method(fs, "writeFile", async () => {
      throw new Error("fixture denied write");
    });
    const nativeFallback = await readCcusageReport(
      "all",
      "daily",
      range,
      options,
    );
    assert.deepEqual(
      usagePeriodsFrom(nativeFallback, "daily"),
      usagePeriodsFrom(directAll, "daily"),
    );
  } finally {
    await removeFixture(home);
  }
});

const zstdCompress = (
  zlib as typeof zlib & { zstdCompressSync?: (data: Buffer) => Buffer }
).zstdCompressSync;

test(
  "native compressed DSH history preserves the newest generation and missing price through export",
  { skip: !zstdCompress },
  async () => {
    assert.ok(zstdCompress);
    const home = await mkdtemp(join(tmpdir(), "token-atlas-codex-test-"));
    try {
      const time = Date.parse(timestamp);
      const model = "token-atlas-dsh-fixture-unpriced";
      const rows = [
        {
          type: "session",
          id: "compressed-dsh",
          isSeeded: false,
          createdAt: time,
          cwd: "/fixture",
        },
        {
          type: "request/context",
          seq: 1,
          time,
          data: { provider: "deepseek-official", model },
        },
        {
          type: "assistant/message",
          seq: 2,
          time,
          data: {
            usage: { inputTokens: 15, outputTokens: 5, totalTokens: 20 },
          },
        },
      ];
      const encode = (records: object[]) =>
        records.map((record) => JSON.stringify(record)).join("\n") + "\n";
      const history = ".dsh/sessions/test/compressed/";
      await writeRollout(home, history + "session.v3.jsonl", encode(rows));
      await writeRollout(
        home,
        history + "session.v4.jsonl.zstd",
        Buffer.concat([
          zstdCompress(Buffer.from(encode(rows.slice(0, 2)))),
          zstdCompress(Buffer.from(encode(rows.slice(2)))),
        ]),
      );
      const range = resolveUsageRange({
        start: "2026-07-10",
        end: "2026-07-10",
        timezone: "Asia/Shanghai",
      });
      const report = await readCcusageReport("dsh", "daily", range, {
        cwd: home,
        env: fixtureEnvironment(home),
      });
      const daily = usagePeriodsFrom(report, "daily");
      const snapshot = assembleUsageSnapshot({
        range,
        device: "local",
        source: "dsh",
        local: { daily, sessions: [] },
        imports: { devices: [], dailyByDevice: {}, warnings: [] },
      });
      assert.equal(snapshot.totals.totalTokens, 20);
      assert.deepEqual(snapshot.totals.unpricedModels, [model]);
      const exported = buildUsageViewExport(
        { ...snapshot, readerVersion: "20.1.1" },
        "dsh",
      );
      const imported = validateUsageImport(exported, "DSH fixture", "dsh");
      assert.equal(imported.source, "dsh");
      assert.equal(imported.readerVersion, "20.1.1");
      assert.deepEqual(imported.daily[0].unpricedModels, [model]);
    } finally {
      await removeFixture(home);
    }
  },
);

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
    const range = resolveUsageRange({
      start: "2026-11-18",
      end: "2026-11-18",
      timezone: "Asia/Shanghai",
    });
    const options = { cwd: fixtureDir, env: fixtureEnvironment(fixtureDir) };
    await writeRollout(fixtureDir, ".ccusage/ccusage.json", "{}");
    const [focused, unified] = await Promise.all([
      readReport(fixtureDir, "daily", [...bounds, "--speed", "standard"]),
      readCcusageReport("all", "daily", range, options),
    ]);
    await writeRollout(
      fixtureDir,
      ".ccusage/ccusage.json",
      '{"codex":{"defaults":{"speed":"fast"}}}',
    );
    const fast = await readCcusageReport("codex", "daily", range, options);
    for (const [report, expected] of [
      [focused, 0.00124],
      [unified, 0.001488],
    ] as const) {
      const [day] = usagePeriodsFrom(report, "daily");
      assert.equal(day.totalTokens, 240);
      assert.equal(day.unpricedModels, undefined);
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

    const snapshot = assembleUsageSnapshot({
      range: resolveUsageRange({ start: "2026-11-18", end: "2026-11-18" }),
      device: "local",
      source: "all",
      local: { daily: usagePeriodsFrom(unified, "daily"), sessions },
      imports: { devices: [], dailyByDevice: {}, warnings: [] },
    });
    const exported = buildUsageViewExport(snapshot, "all");
    assert.equal(snapshot.warnings.length, 0);
    assert.equal(
      validateUsageImport(exported, "Fixture", "codex").daily[0].costUSD,
      snapshot.totals.costUSD,
    );
  } finally {
    await removeFixture(fixtureDir);
  }
});

test("native Codex pricing covers bare Astra alongside a dated custom price", async () => {
  const fixtureDir = await mkdtemp(join(tmpdir(), "token-atlas-codex-test-"));
  try {
    const bare = "gpt-6.2-astra";
    const dated = `${bare}-20261118`;
    await writeRollout(
      fixtureDir,
      "sessions/2026/07/10/bare.jsonl",
      plain.replace("gpt-5", bare),
    );
    await writeRollout(
      fixtureDir,
      "sessions/2026/07/10/dated.jsonl",
      plain
        .replace("gpt-5", dated)
        .replaceAll(timestamp, "2026-07-10T00:01:00Z"),
    );
    await writeRollout(
      fixtureDir,
      ".ccusage/ccusage.json",
      JSON.stringify({
        codex: {
          defaults: {
            pricingOverrides: {
              [dated]: {
                inputCostPerToken: 0.00001,
                cacheReadInputTokenCost: 0.000001,
                outputCostPerToken: 0.00002,
              },
            },
          },
        },
      }),
    );
    const range = resolveUsageRange({
      start: "2026-07-10",
      end: "2026-07-10",
      timezone: "Asia/Shanghai",
    });
    const options = { cwd: fixtureDir, env: fixtureEnvironment(fixtureDir) };
    const [daily, sessions] = await Promise.all([
      readCcusageReport("codex", "daily", range, options),
      readCcusageReport("codex", "session", range, options),
    ]);
    const [day] = usagePeriodsFrom(daily, "daily");
    const costs = new Map(
      usageSessionsFrom(sessions).map(({ models, costUSD }) => [
        models[0],
        +costUSD.toFixed(9),
      ]),
    );
    assert.equal(day.unpricedModels, undefined);
    assert.equal(+day.costUSD.toFixed(9), 0.001672);
    assert.equal(costs.get(bare), 0.000992);
    assert.equal(costs.get(dated), 0.00068);
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
    const range = resolveUsageRange({
      start: "2026-07-10",
      end: "2026-07-10",
      timezone: "Asia/Shanghai",
    });
    const options = { cwd: fixtureDir, env: fixtureEnvironment(fixtureDir) };
    const [dailyResult, sessionResult] = await Promise.all([
      readCcusageReport("codex", "daily", range, options),
      readCcusageReport("codex", "session", range, options),
    ]);
    assert.equal(
      +usagePeriodsFrom(dailyResult, "daily")[0].costUSD.toFixed(9),
      0.00068,
    );
    assert.equal(
      +usageSessionsFrom(sessionResult)[0].costUSD.toFixed(9),
      0.000496,
    );
    assert.deepEqual(
      JSON.parse(
        await readFile(join(fixtureDir, ".ccusage", "ccusage.json"), "utf8"),
      ),
      original,
    );
  } finally {
    await removeFixture(fixtureDir);
  }
});

test("Codex pricing keeps the native rate of an explicitly aliased model", async () => {
  const fixtureDir = await mkdtemp(join(tmpdir(), "token-atlas-codex-test-"));
  try {
    await writeRollout(
      fixtureDir,
      "sessions/2026/07/10/sol.jsonl",
      plain.replace("gpt-5", "gpt-6.2-sol"),
    );
    await writeRollout(
      fixtureDir,
      ".ccusage/ccusage.json",
      JSON.stringify({
        defaults: {
          pricingOverrides: {
            "custom-sol-route": {
              inputCostPerToken: 0.00001,
              cacheReadInputTokenCost: 0.000001,
              outputCostPerToken: 0.00002,
            },
          },
        },
      }),
    );
    for (const modelAliases of [
      "gpt-6.2-sol=custom-sol-route",
      '{"gpt-6.2-sol":"custom-sol-route"}',
    ]) {
      const range = resolveUsageRange({
        start: "2026-07-10",
        end: "2026-07-10",
        timezone: "Asia/Shanghai",
      });
      const payload = await readCcusageReport("codex", "daily", range, {
        cwd: fixtureDir,
        env: fixtureEnvironment(fixtureDir, modelAliases),
      });
      assert.equal(
        +usagePeriodsFrom(payload, "daily")[0].costUSD.toFixed(9),
        0.00068,
      );
    }
  } finally {
    await removeFixture(fixtureDir);
  }
});

test("a recoverable user setting does not make the dashboard's Codex report fail", async () => {
  const home = await mkdtemp(join(tmpdir(), "token-atlas-codex-test-"));
  try {
    await writeRollout(
      home,
      "sessions/2026/07/10/astra.jsonl",
      plain.replace("gpt-5", "gpt-6.2-astra"),
    );
    await writeRollout(
      home,
      ".ccusage/ccusage.json",
      '{"defaults":{"json":"invalid-bool"}}',
    );
    const plainReport = await readReport(home, "daily");
    assert.equal(usagePeriodsFrom(plainReport, "daily")[0].totalTokens, 120);
    const range = resolveUsageRange({
      start: "2026-07-10",
      end: "2026-07-10",
      timezone: "Asia/Shanghai",
    });
    const report = await readCcusageReport("codex", "daily", range, {
      cwd: home,
      env: fixtureEnvironment(home),
    });
    assert.equal(usagePeriodsFrom(report, "daily")[0].totalTokens, 120);
  } finally {
    await removeFixture(home);
  }
});

test("Codex usage can still be read when the optional Fast config directory cannot be created", async (t) => {
  const home = await mkdtemp(join(tmpdir(), "token-atlas-codex-test-"));
  try {
    await writeRollout(
      home,
      "sessions/2026/07/10/astra.jsonl",
      plain.replace("gpt-5", "gpt-6.2-astra"),
    );
    const range = resolveUsageRange({
      start: "2026-07-10",
      end: "2026-07-10",
      timezone: "Asia/Shanghai",
    });
    t.mock.method(fs, "mkdtemp", async () => {
      throw new Error("fixture denied allocation");
    });
    const report = await readCcusageReport("codex", "daily", range, {
      cwd: home,
      env: fixtureEnvironment(home),
    });
    assert.equal(usagePeriodsFrom(report, "daily")[0].totalTokens, 120);
  } finally {
    await removeFixture(home);
  }
});
