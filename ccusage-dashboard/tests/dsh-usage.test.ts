import assert from "node:assert/strict";
import test from "node:test";
import { usageSourceOptions } from "../lib/usage-types";
import { workspaceState } from "../lib/workspace-state";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { readDshUsage } from "../lib/dsh-usage";
import { resolveUsageRange } from "../lib/usage-range";
import {
  combineLocalUsageReports,
  assembleUsageSnapshot,
} from "../lib/usage-snapshot";
import { validateUsageImport } from "../lib/usage-import-validation";
import { buildUsageViewExport } from "../lib/usage-export";

const range = resolveUsageRange(
  { days: "all", timezone: "Asia/Shanghai" },
  new Date("2026-11-10T12:00:00Z"),
);
const time = Date.parse("2026-11-10T00:00:00Z");
const header = (id: string, extra = {}) => ({
  type: "session",
  version: 4,
  id,
  createdAt: time,
  isSeeded: false,
  cwd: "/test/project",
  ...extra,
});
const event = (id: string, tokens = 125, extra = {}) => ({
  type: "assistant/message",
  seq: 1,
  time,
  data: {
    message: {
      id,
      source: { kind: "model", model: "test-dsh" },
      content: [{ text: "private fixture text" }],
    },
    usage: {
      inputTokens: tokens - 25,
      cacheReadTokens: 20,
      outputTokens: 5,
      reasoningOutputTokens: 2,
      totalTokens: tokens,
    },
  },
  ...extra,
});
const marker = { type: "session/end-seed", seq: 2, time, data: {} };
const compressedHeader = Buffer.from(
  "KLUv/SBk1QIA8oUUGoBrsQHgxHCtlIHpdKLXIUq36KjjHDONKVgPgEhVVSkKYZAYCgLzHu67PBnTNbE05vv9CEWTn4x1YBO4qz4fhcPYfGhKLN8weeGg6tXmP481JAEAKpQm",
  "base64",
);
const compressedEvent = Buffer.from(
  "KLUv/SDavQQAkkkeHmA1bgNIYW+5Mdbi2X4xZY1JskACNbSx42SzCDIMcoL3nlEkRrv10WjXjqhQuolVEEWOCKU8s10aQDuHrUTZHd+7wmrQvP3EM6saWwsi4FpqnlfrT/7Ja6s6ouMwFAXEIeW3WX1M+YDl4zdR5m0IzbR5Mevz6wz0nwoARRG+lDHnpBGqa1cS5mzupuSuApKKEAUACg==",
  "base64",
);

async function fixture(run: (home: string) => Promise<void>) {
  const home = await mkdtemp(join(tmpdir(), "token-atlas-dsh-test-"));
  try {
    await run(home);
  } finally {
    assert.equal(dirname(home), resolve(tmpdir()));
    assert.ok(basename(home).startsWith("token-atlas-dsh-test-"));
    await rm(home, { recursive: true, force: true });
  }
}
async function log(
  home: string,
  id: string,
  rows: unknown[] | Buffer,
  name = "session.v4.jsonl",
) {
  const directory = join(home, "sessions", "project", id);
  await mkdir(directory, { recursive: true });
  await writeFile(
    join(directory, name),
    Buffer.isBuffer(rows)
      ? rows
      : rows.map((row) => JSON.stringify(row)).join("\n") + "\n",
  );
}

test("DSH is a distinct selectable source instead of silently falling back to all Agents", () => {
  assert.ok(
    usageSourceOptions.some((source) => String(source.value) === "dsh"),
  );
  assert.equal(
    workspaceState(new URLSearchParams("source=dsh&days=all")).source,
    "dsh",
  );
});

test("DSH prices Flash token usage using official USD peak rates", async () =>
  fixture(async (home) => {
    const sample = event("official");
    sample.time = Date.parse("2026-11-10T01:30:00Z");
    sample.data.message.source.model = "deepseek-v4.1-flash";
    sample.data.usage = {
      inputTokens: 1_000_000,
      cacheReadTokens: 2_000_000,
      outputTokens: 500_000,
      totalTokens: 3_500_000,
      reasoningOutputTokens: 2,
    };
    await log(home, "official", [header("official"), sample]);
    const report = await readDshUsage(range, home);
    assert.equal(report.daily[0].costUSD, 0.912);
    assert.equal(report.sessions[0].costUSD, 0.912);
    assert.equal(report.daily[0].unpricedModels, undefined);
  }));

test("DSH prices each request before daily aggregation and preserves the result through export/import", async () =>
  fixture(async (home) => {
    const rows = [event("off-peak"), event("peak")];
    rows[0].time = Date.parse("2026-11-10T00:30:00Z");
    rows[1].time = Date.parse("2026-11-10T01:30:00Z");
    for (const row of rows) {
      row.data.message.source.model = "deepseek-v4.1-flash";
      row.data.usage = {
        inputTokens: 1_000_000,
        cacheReadTokens: 2_000_000,
        outputTokens: 500_000,
        totalTokens: 3_500_000,
        reasoningOutputTokens: 2,
      };
    }
    await log(home, "mixed-prices", [header("mixed-prices"), ...rows]);
    const local = await readDshUsage(range, home);
    const snapshot = {
      ...assembleUsageSnapshot({
        range,
        source: "dsh",
        device: "local",
        local,
        imports: { devices: [], dailyByDevice: {}, warnings: [] },
      }),
      reader: "dsh" as const,
    };
    assert.equal(snapshot.totals.costUSD, 1.368);
    for (const records of [
      snapshot.daily,
      snapshot.weekly,
      snapshot.monthly,
      snapshot.models,
      snapshot.sessions,
    ]) {
      assert.equal(
        records.reduce((sum, row) => sum + row.costUSD, 0),
        1.368,
      );
    }
    const exported = buildUsageViewExport(snapshot, "dsh");
    assert.equal(exported.dshPricing?.currency, "USD");
    const imported = validateUsageImport(exported, "External DSH", "dsh");
    assert.equal(imported.daily[0].costUSD, 1.368);
    assert.equal(imported.daily[0].unpricedModels, undefined);
  }));

test("DSH preserves an explicit recorded USD cost instead of replacing it with an estimate", async () =>
  fixture(async (home) => {
    const sample = event("recorded");
    sample.data.message.source.model = "deepseek-v4.1-flash";
    const stored = {
      ...sample,
      data: { ...sample.data, usage: { ...sample.data.usage, costUSD: 7.5 } },
    };
    await log(home, "recorded", [header("recorded"), stored]);
    const report = await readDshUsage(range, home);
    assert.equal(report.daily[0].costUSD, 7.5);
    assert.equal(report.daily[0].unpricedModels, undefined);
  }));

test("DSH preserves unusual model names without using inherited object properties", async () =>
  fixture(async (home) => {
    const sample = event("first");
    sample.data.message.source.model = "constructor";
    const second = {
      ...sample,
      seq: 2,
      data: {
        ...sample.data,
        message: { ...sample.data.message, id: "second" },
      },
    };
    await log(home, "names", [header("names"), sample, second]);
    const report = await readDshUsage(range, home);
    assert.equal(
      Object.entries(report.daily[0].models).find(
        ([name]) => name === "constructor",
      )?.[1].totalTokens,
      250,
    );
  }));

test("DSH rejects malformed inherited boundaries instead of counting inherited tokens", async () =>
  fixture(async (home) => {
    await log(home, "bad-seed", [
      header("bad-seed", { isSeeded: true, seedLength: -1 }),
      event("parent"),
    ]);
    const report = await readDshUsage(range, home);
    assert.equal(report.daily.length, 0);
    assert.ok(report.error);
  }));

test("DSH projects only completed usage, deduplicates message IDs and preserves unknown prices", async () =>
  fixture(async (home) => {
    await log(home, "a", [
      header("a"),
      { ...event("ignored"), type: "assistant/attempt" },
      event("a"),
      { ...event("a"), seq: 9 },
    ]);
    const report = await readDshUsage(range, home);
    assert.equal(report.daily[0].totalTokens, 125);
    assert.equal(report.daily[0].inputTokens, 100);
    assert.equal(report.daily[0].cacheReadTokens, 20);
    assert.equal(report.daily[0].reasoningOutputTokens, 2);
    assert.deepEqual(report.daily[0].unpricedModels, ["test-dsh"]);
    assert.equal(report.sessions[0].source, "dsh");
    assert.equal(report.sessions[0].id, "dsh:a");
    assert.equal(
      JSON.stringify(report).includes("private fixture text"),
      false,
    );
  }));

test("DSH reads concatenated Zstandard frames without Node's experimental Zstd API", async () =>
  fixture(async (home) => {
    await log(
      home,
      "compressed",
      Buffer.concat([compressedHeader, compressedEvent]),
      "session.v4.jsonl.zstd",
    );
    const report = await readDshUsage(range, home);
    assert.equal(report.error, undefined);
    assert.equal(report.daily[0]?.totalTokens, 125);
    assert.equal(report.sessions[0].totalTokens, 125);
  }));

test("DSH keeps only the suffix after the last inherited-history marker", async () =>
  fixture(async (home) => {
    await log(home, "seeded", [
      header("seeded", { isSeeded: true }),
      event("parent"),
      marker,
      event("intermediate", 75),
      marker,
      event("new", 30),
    ]);
    const report = await readDshUsage(range, home);
    assert.equal(report.daily[0]?.totalTokens, 30);
  }));

test("DSH legacy numeric seed length counts physical events, not sequence numbers", async () =>
  fixture(async (home) => {
    await log(
      home,
      "legacy",
      [
        header("legacy", { version: 3, seedLength: 1, isSeeded: true }),
        { ...event("parent"), seq: 100 },
        event("new", 30),
      ],
      "session.v3.jsonl",
    );
    assert.equal((await readDshUsage(range, home)).daily[0]?.totalTokens, 30);
  }));

test("DSH honors the timezone and exact inclusive date scope", async () =>
  fixture(async (home) => {
    await log(home, "range", [
      header("range"),
      event("day9", 30, { time: Date.parse("2026-11-09T15:30:00Z") }),
      event("day10", 50, { time: Date.parse("2026-11-09T16:30:00Z") }),
    ]);
    const selected = resolveUsageRange(
      { start: "2026-11-10", end: "2026-11-10", timezone: "Asia/Shanghai" },
      new Date("2026-11-10T12:00:00Z"),
    );
    const report = await readDshUsage(selected, home);
    assert.equal(report.daily.length, 1);
    assert.equal(report.daily[0].label, "2026-11-10");
    assert.equal(report.daily[0].totalTokens, 50);
    assert.equal(report.sessions[0].totalTokens, 50);
  }));

test("DSH selects one highest generation and never sums old or alternate copies", async () =>
  fixture(async (home) => {
    await log(
      home,
      "copies",
      [header("old", { version: 3 }), event("old", 300)],
      "session.v3.jsonl",
    );
    await log(
      home,
      "copies",
      Buffer.concat([compressedHeader, compressedEvent]),
      "session.v4.jsonl.zstd",
    );
    assert.equal((await readDshUsage(range, home)).daily[0].totalTokens, 125);
    await log(home, "copies", [header("current"), event("current", 50)]);
    assert.equal((await readDshUsage(range, home)).daily[0].totalTokens, 50);
  }));

test("DSH reports unsupported newest generations and corrupt files without hiding valid sessions", async () =>
  fixture(async (home) => {
    await log(home, "good", [header("good"), event("good", 30)]);
    await log(home, "unknown", [header("old"), event("old", 300)]);
    await log(
      home,
      "unknown",
      [header("future", { version: 5 }), event("future", 300)],
      "session.v5.jsonl",
    );
    await log(
      home,
      "corrupt",
      Buffer.from("not-zstd"),
      "session.v4.jsonl.zstd",
    );
    const report = await readDshUsage(range, home);
    assert.equal(report.daily[0].totalTokens, 30);
    assert.ok(report.warnings?.length);
    assert.equal(report.error, undefined);
  }));

test("DSH refuses seeded usage with no inherited boundary and treats missing roots as empty", async () =>
  fixture(async (home) => {
    assert.equal((await readDshUsage(range, home)).detected, false);
    await log(home, "bad", [header("bad", { isSeeded: true }), event("bad")]);
    const report = await readDshUsage(range, home);
    assert.equal(report.daily.length, 0);
    assert.ok(report.error);
  }));

test("DSH joins global totals and aggregate imports without becoming Codex usage", async () =>
  fixture(async (home) => {
    await log(home, "a", [header("a"), event("a")]);
    const dsh = await readDshUsage(range, home);
    const local = combineLocalUsageReports([
      { daily: [], sessions: [], error: "native unavailable" },
      dsh,
    ]);
    assert.equal(local.error, undefined);
    const snapshot = assembleUsageSnapshot({
      range,
      source: "all",
      device: "local",
      local,
      imports: { devices: [], dailyByDevice: {}, warnings: [] },
    });
    assert.equal(snapshot.totals.totalTokens, 125);
    assert.equal(snapshot.weekly[0].totalTokens, 125);
    assert.equal(snapshot.monthly[0].totalTokens, 125);
    assert.equal(snapshot.sessions[0].totalTokens, 125);
    assert.ok(snapshot.warnings.includes("native unavailable"));
    const imported = validateUsageImport(
      { daily: snapshot.daily },
      "DSH device",
      "dsh",
    );
    assert.equal(imported.source, "dsh");
    assert.equal(imported.daily[0].totalTokens, 125);
  }));
