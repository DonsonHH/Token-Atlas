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
      // Isolate all Agent roots for the unified reader too. These overrides
      // affect only the child process, never this machine's actual settings.
      env: {
        ...process.env,
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
