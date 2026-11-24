import assert from "node:assert/strict";
import type { Dir, Dirent, PathLike } from "node:fs";
import fs from "node:fs/promises";
import { mkdir, mkdtemp, open, rm, utimes, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import test from "node:test";
import * as zlib from "node:zlib";
import { resolveUsageRange } from "../lib/usage-range";
import { readNativePerformance } from "../lib/native-performance";
import { scanJsonl } from "../lib/native-jsonl";
import { createPerformanceReader } from "../lib/performance-read-service";
import type { PerformanceReport } from "../lib/performance-types";
import { indexTimingFiles } from "../lib/timing-file-index";
import {
  TIMING_BATCH_MS,
  TIMING_INVENTORY_LIMIT,
  TIMING_SCOPE_FILES,
} from "../lib/timing-limits";
const base = Date.parse("2026-11-23T04:00:00Z");
const time = (ms: number) => new Date(base + ms).toISOString();
const event = (ms: number, type: string, payload: object) => ({
  timestamp: time(ms),
  type,
  payload,
});
const usage = {
  input_tokens: 800,
  cached_input_tokens: 400,
  output_tokens: 600,
  total_tokens: 1400,
};
const range = resolveUsageRange(
  {
    start: "2026-11-23",
    end: "2026-11-23",
    timezone: "Asia/Shanghai",
  },
  new Date(base + 86_400_000),
);
const zip = (
  zlib as typeof zlib & {
    zstdCompressSync?: (bytes: Buffer) => Buffer;
  }
).zstdCompressSync;

async function fixture(run: (roots: { codex: string }) => Promise<void>) {
  const dir = await mkdtemp(join(tmpdir(), "token-atlas-native-timing-"));
  try {
    await run({ codex: join(dir, "codex") });
  } finally {
    assert.equal(dirname(dir), resolve(tmpdir()));
    assert.ok(basename(dir).startsWith("token-atlas-native-timing-"));
    await rm(dir, { recursive: true, force: true });
  }
}
async function log(file: string, rows: object[]) {
  await mkdir(dirname(file), { recursive: true });
  await writeFile(
    file,
    rows.map((row) => JSON.stringify(row)).join("\n") + "\n",
  );
}

test(
  "an expanding compressed timing file cannot run past its decoded byte budget",
  { skip: !zip },
  () =>
    fixture(async ({ codex }) => {
      assert.ok(zip);
      await mkdir(codex, { recursive: true });
      const path = join(codex, "expanding.jsonl.zst");
      const oneLine = JSON.stringify({ padding: "a".repeat(240) }) + "\n";
      const zipped = zip(Buffer.from(oneLine.repeat(8_000)));
      assert.ok(zipped.length < 20_000);
      await writeFile(path, zipped);
      let lines = 0;
      const limit = 64 * 1024;
      const read = await scanJsonl(path, () => lines++, zipped.length, {
        maxBytes: limit,
        deadline: Date.now() + 2000,
      });
      assert.deepEqual(read, { decodedBytes: limit, limited: true });
      assert.equal(lines, Math.floor(limit / oneLine.length));
    }),
);

test(
  "bounded Zstandard timing reads every frame even when Node receives them in one chunk",
  { skip: !zip },
  () =>
    fixture(async ({ codex }) => {
      assert.ok(zip);
      await mkdir(codex, { recursive: true });
      const path = join(codex, "multi-frame.jsonl.zst");
      const compressed = Buffer.concat([
        zip(Buffer.from("header\npar")),
        zip(Buffer.from("tial\nrequest\n")),
      ]);
      await writeFile(path, compressed);
      const lines: string[] = [];
      const result = await scanJsonl(
        path,
        (line) => lines.push(line),
        compressed.length,
        {
          maxBytes: 4096,
          deadline: Date.now() + 2000,
        },
      );
      assert.deepEqual(lines, ["header", "partial", "request"]);
      assert.deepEqual(result, {
        decodedBytes: Buffer.byteLength("header\npartial\nrequest\n"),
        limited: false,
      });
    }),
);

test(
  "bounded Zstandard timing checks the deadline even between frames with no output",
  { skip: !zip },
  (t) =>
    fixture(async ({ codex }) => {
      assert.ok(zip);
      await mkdir(codex, { recursive: true });
      const path = join(codex, "skippable-frame.jsonl.zst");
      // A valid skippable frame crosses the input chunk boundary but has no
      // decoded bytes, so checking the clock only on output is insufficient.
      const skippable = Buffer.alloc(8 + 64 * 1024);
      skippable.writeUInt32LE(0x184d2a50, 0);
      skippable.writeUInt32LE(skippable.length - 8, 4);
      const compressed = Buffer.concat([
        zip(Buffer.from("header\n")),
        skippable,
      ]);
      await writeFile(path, compressed);
      let now = 1000;
      t.mock.method(Date, "now", () => now);
      const lines: string[] = [];
      const result = await scanJsonl(
        path,
        (line) => {
          lines.push(line);
          now = 2000;
        },
        compressed.length,
        { maxBytes: compressed.length, deadline: 2000 },
      );
      assert.deepEqual(lines, ["header"]);
      assert.deepEqual(result, {
        decodedBytes: 7,
        limited: true,
        timedOut: true,
      });
    }),
);

test("a timing refresh serves simultaneous tabs from one work item and caches the result briefly", async () => {
  let clock = 1000;
  const read = createPerformanceReader(() => clock);
  const report: PerformanceReport = {
    generatedAt: time(0),
    totals: { requests: 0, speed: null, firstToken: null },
    models: [],
    coverage: [],
    recent: [],
  };
  let starts = 0;
  let finish!: (r: PerformanceReport) => void;
  const slow = () => {
    starts++;
    return new Promise<PerformanceReport>((resolve) => {
      finish = resolve;
    });
  };
  const first = read("scope", slow);
  assert.ok(first);
  assert.equal(read("scope", slow), first);
  assert.equal(read("other", slow), null);
  await Promise.resolve();
  assert.equal(starts, 1);
  finish(report);
  assert.equal(await first, report);
  assert.equal(await read("scope", slow), report);
  assert.equal(starts, 1);
  clock += 60_000;
  const refreshed = read("scope", async () => {
    starts++;
    return { ...report, generatedAt: time(clock) };
  });
  assert.notEqual((await refreshed)?.generatedAt, report.generatedAt);
  assert.equal(starts, 2);
});

test("a very wide timing selection has finite coverage, not an unbounded pending queue", async () => {
  const files = Array.from({ length: 130 }, (_, index) => ({
    path: "fixture-meta-" + index,
    size: 10,
    modified: 1,
  }));
  const work = () =>
    indexTimingFiles(
      "codex",
      "coverage-limit-fixture",
      files,
      async (file) => ({
        decodedBytes: file.size,
        limited: false,
        samples: [],
      }),
      0,
    );
  const first = await work();
  assert.equal(first.coverage.pending, 80);
  assert.equal(first.coverage.limited, 2);
  await work();
  const last = await work();
  assert.equal(last.coverage.scanned, 128);
  assert.equal(last.coverage.pending, 0);
  assert.equal(last.coverage.limited, 2);
});

test("a session cut short by earlier files in its batch can complete on the next refresh", async (t) => {
  let now = 1000;
  t.mock.method(Date, "now", () => now);
  const files = [
    { path: "first", size: 100, modified: 1 },
    { path: "next", size: 100, modified: 2 },
  ];
  const read = () =>
    indexTimingFiles(
      "codex",
      "deadline-retry-fixture",
      files,
      async (file, budget) => {
        now += file.path === "first" ? TIMING_BATCH_MS - 5 : 10;
        const timedOut = now >= budget.deadline;
        return { samples: [], decodedBytes: 100, limited: timedOut, timedOut };
      },
      0,
    );
  assert.equal((await read()).coverage.limited, 1);
  assert.equal((await read()).coverage.scanned, 2);
});

test("a recent Codex range does not start indexing unrelated old rollouts", () =>
  fixture(async (roots) => {
    const fresh = join(
      roots.codex,
      "sessions",
      "rollout-2026-11-23T12-00-00-00000000-0000-4000-8000-000000000099.jsonl",
    );
    const old = join(
      roots.codex,
      "archived_sessions",
      "rollout-2026-09-01T12-00-00-00000000-0000-4000-8000-000000000098.jsonl",
    );
    for (const [file, offset, name] of [
      [fresh, 0, "fresh"],
      [old, -83 * 86_400_000, "archived"],
    ] as const) {
      await log(file, [
        event(offset, "session_meta", { id: name }),
        event(offset + 100, "turn_context", { model: name }),
        event(offset + 2_100, "token_usage_record", {
          response_id: name,
          usage,
        }),
      ]);
      await utimes(file, new Date(base + offset), new Date(base + offset));
    }
    const report = await readNativePerformance(range, roots.codex);
    assert.equal(report.coverage[0].scanned, 1);
    assert.equal(report.coverage[0].pending, 0);
    assert.equal(report.totals.speed?.samples, 1);
    const historical = await readNativePerformance(
      resolveUsageRange(
        {
          days: "all",
          timezone: range.timezone,
        },
        new Date(base),
      ),
      roots.codex,
    );
    assert.equal(historical.totals.speed?.samples, 2);
  }));

test("a large plain rollout supplies bounded tail timing without reading a giant line", () =>
  fixture(async (roots) => {
    const file = join(
      roots.codex,
      "sessions",
      "rollout-2026-11-23T12-00-00-00000000-0000-4000-8000-000000000097.jsonl",
    );
    await log(file, [event(0, "session_meta", { id: "scope-giant" })]);
    const handle = await open(file, "r+");
    try {
      const tail = Buffer.from(
        "\n" +
          [
            event(1_200, "turn_context", { model: "bounded" }),
            event(4_200, "token_usage_record", {
              response_id: "recent-response",
              usage,
            }),
          ]
            .map((obj) => JSON.stringify(obj))
            .join("\n") +
          "\n",
      );
      // A small sparse fixture: the previous parser consumed the giant line.
      await handle.write(tail, 0, tail.length, 18 * 1024 * 1024);
    } finally {
      await handle.close();
    }
    const report = await readNativePerformance(range, roots.codex);
    assert.equal(report.totals.speed?.value, 200);
    assert.equal(report.coverage[0].limited, 1);
  }));

test("native Codex evidence joins timing to the same response, without CC Switch", () =>
  fixture(async (roots) => {
    await log(
      join(
        roots.codex,
        "sessions",
        "2026",
        "11",
        "23",
        "rollout-2026-11-23T12-00-00-00000000-0000-4000-8000-000000000001.jsonl",
      ),
      [
        event(0, "session_meta", { id: "fixture-thread" }),
        event(0, "event_msg", { type: "task_started", turn_id: "turn-1" }),
        event(1000, "turn_context", {
          turn_id: "turn-1",
          model: "gpt-6.2-sol",
        }),
        event(5000, "event_msg", {
          type: "item_completed",
          turn_id: "turn-1",
          started_at_ms: base + 3000,
          item: { type: "Reasoning" },
        }),
        event(7000, "response_item", {
          type: "message",
          role: "assistant",
          content: ["fixture private content"],
        }),
        event(7000, "token_usage_record", {
          turn_id: "turn-1",
          response_id: "fixture-response",
          usage,
        }),
        event(7001, "event_msg", {
          type: "token_count",
          info: { last_token_usage: usage, total_token_usage: usage },
        }),
        event(8000, "event_msg", {
          type: "task_complete",
          turn_id: "turn-1",
          duration_ms: 8000,
          time_to_first_token_ms: 1200,
        }),
      ],
    );
    const report = await readNativePerformance(range, roots.codex);
    assert.equal(report.totals.requests, 1);
    assert.deepEqual(report.totals.speed, { value: 100, samples: 1 });
    assert.deepEqual(report.totals.firstToken, { value: 2000, samples: 1 });
    assert.equal(report.models[0].model, "gpt-6.2-sol");
    assert.ok(
      !/fixture private content|fixture-response|fixture-thread/.test(
        JSON.stringify(report),
      ),
    );
  }));

test("a late assistant item does not duplicate the same Codex settlement", () =>
  fixture(async (roots) => {
    await log(
      join(
        roots.codex,
        "sessions",
        "rollout-2026-11-23T12-00-00-00000000-0000-4000-8000-000000000017.jsonl",
      ),
      [
        event(0, "session_meta", { id: "mirror-fixture" }),
        event(100, "turn_context", { model: "gpt-6.2-sol" }),
        event(1500, "token_usage_record", {
          response_id: "one-settlement",
          usage,
          thread_token_usage: usage,
        }),
        event(1700, "response_item", { type: "message", role: "assistant" }),
        event(1900, "event_msg", {
          type: "token_count",
          info: { last_token_usage: usage, total_token_usage: usage },
        }),
      ],
    );
    const report = await readNativePerformance(range, roots.codex);
    assert.equal(report.totals.requests, 1);
    assert.equal(report.recent.length, 1);
  }));

test("nearby Codex responses with equal usage are not mirrors across distinct output evidence", () =>
  fixture(async (roots) => {
    const file = join(
      roots.codex,
      "sessions",
      "rollout-2026-11-23T12-00-00-00000000-0000-4000-8000-000000000011.jsonl",
    );
    await log(file, [
      event(0, "session_meta", { id: "nearby-thread" }),
      event(10, "turn_context", { model: "gpt-nearby", turn_id: "turn-a" }),
      event(1_200, "event_msg", {
        type: "token_count",
        info: { last_token_usage: usage, total_token_usage: usage },
      }),
      event(1_350, "response_item", { type: "function_call_output" }),
      event(1_800, "event_msg", {
        type: "item_completed",
        turn_id: "turn-a",
        started_at_ms: base + 1_500,
        item: { type: "AgentMessage" },
      }),
      event(2_100, "token_usage_record", {
        turn_id: "turn-a",
        response_id: "nearby-response",
        usage,
        thread_token_usage: {
          input_tokens: 1600,
          cached_input_tokens: 800,
          output_tokens: 1200,
          total_tokens: 2800,
        },
      }),
    ]);
    const result = await readNativePerformance(range, roots.codex);
    assert.equal(result.totals.requests, 2);
    assert.equal(result.recent[0].durationMs, 750);
    assert.equal(result.recent[0].firstTokenMs, 150);
  }));

test("Codex timing follows the configured comma-separated log roots", () =>
  fixture(async (roots) => {
    const names = [roots.codex + "-one", roots.codex + "-two"];
    for (const [i, root] of names.entries()) {
      const name = `rollout-2026-11-23T12-00-00-00000000-0000-4000-8000-00000000002${i}.jsonl`;
      await log(join(root, "sessions", name), [
        event(0, "session_meta", { id: "multi-root-" + i }),
        event(10, "turn_context", { model: "gpt-" + i }),
        event(2_000, "token_usage_record", {
          response_id: "response-" + i,
          usage,
        }),
      ]);
    }
    const result = await readNativePerformance(range, names.join(", "));
    assert.equal(result.totals.requests, 2);
    assert.equal(result.coverage[0].scanned, 2);
  }));

test("Codex timing keeps discovered rollouts when directory inventory is capped", (t) =>
  fixture(async ({ codex }) => {
    const directory = join(codex, "sessions");
    const valid = join(
      directory,
      "rollout-2026-11-23T12-00-00-00000000-0000-4000-8000-000000000019.jsonl",
    );
    await log(valid, [event(0, "session_meta", { id: "valid-codex" })]);
    const { opendir, readdir } = fs;
    const entries = await readdir(directory, { withFileTypes: true });
    t.mock.method(Date, "now", () => base);
    t.mock.method(fs, "opendir", async (path: PathLike) => {
      if (path !== directory) return opendir(path);
      return {
        async *[Symbol.asyncIterator]() {
          yield* entries;
          for (let n = 0; n <= TIMING_INVENTORY_LIMIT; n++) {
            yield {
              name: "irrelevant-" + n,
              isFile: () => false,
              isDirectory: () => false,
            } as Dirent;
          }
        },
      } as Dir;
    });
    const report = await readNativePerformance(range, codex);
    assert.deepEqual(report.coverage[0], {
      agent: "codex",
      scanned: 1,
      pending: 0,
      skipped: 0,
      limited: 1,
    });
  }));

test(
  "compressed Codex history keeps owned responses, deduplicates copies, and never borrows turn-first-token",
  {
    skip: !zip,
  },
  () =>
    fixture(async (roots) => {
      assert.ok(zip);
      const name =
        "rollout-2026-11-22T23-50-00-00000000-0000-4000-8000-000000000002.jsonl";
      const row = (
        ordinal: number,
        ms: number,
        type: string,
        value: object,
      ) => ({ ordinal, ...event(ms, type, value) });
      const duplicateBeforeFork = {
        id: "fixture-fork",
        forked_from_id: "parent",
        subagent_history_start_ordinal: 4,
      };
      const lines = [
        row(0, 0, "session_meta", duplicateBeforeFork),
        row(1, 500, "turn_context", { model: "gpt-inherited" }),
        row(2, 4_000, "token_usage_record", {
          response_id: "inherited-response",
          usage,
        }),
        row(4, 12_000, "turn_context", {
          model: "gpt-owned",
          turn_id: "turn-own",
        }),
        row(5, 18_000, "token_usage_record", {
          response_id: "own-response",
          usage,
          turn_id: "turn-own",
        }),
        row(6, 18_001, "event_msg", {
          type: "token_count",
          info: { last_token_usage: usage, total_token_usage: usage },
        }),
        row(7, 19_000, "event_msg", {
          type: "task_complete",
          turn_id: "turn-own",
          time_to_first_token_ms: 1200,
        }),
      ];
      const archive = join(roots.codex, "archived_sessions", name + ".zst");
      await mkdir(dirname(archive), { recursive: true });
      const encode = (rows: object[]) =>
        zip(
          Buffer.from(
            rows.map((line) => JSON.stringify(line)).join("\n") + "\n",
          ),
        );
      await writeFile(
        archive,
        Buffer.concat([encode(lines.slice(0, 3)), encode(lines.slice(3))]),
      );
      // An overlapping representation of the same native response is not a new request.
      await log(
        join(
          roots.codex,
          "archived_sessions",
          name.replace("000002", "000003"),
        ),
        lines,
      );
      const report = await readNativePerformance(range, roots.codex);
      assert.deepEqual(
        report.models.map(({ model }) => model),
        ["gpt-owned"],
      );
      assert.equal(report.totals.requests, 1);
      assert.equal(report.totals.speed?.value, 100);
      assert.equal(report.totals.firstToken, null);
      assert.equal(report.coverage[0].scanned, 2);
      const preceding = resolveUsageRange(
        {
          start: "2026-11-22",
          end: "2026-11-22",
          timezone: range.timezone,
        },
        new Date(base + 86_400_000),
      );
      assert.equal(
        (await readNativePerformance(preceding, roots.codex)).totals.requests,
        0,
      );
    }),
);

test("timing rereads a changed session and never publishes an unterminated tail", () =>
  fixture(async (roots) => {
    const path = join(
      roots.codex,
      "sessions",
      "rollout-2026-11-23T12-00-00-00000000-0000-4000-8000-000000000004.jsonl",
    );
    const records = [
      event(0, "session_meta", { id: "fixture-live" }),
      event(2_000, "turn_context", { model: "gpt-live" }),
      event(8_000, "token_usage_record", {
        response_id: "fixture-live",
        usage,
      }),
    ];
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, records.map((row) => JSON.stringify(row)).join("\n"));
    assert.equal(
      (await readNativePerformance(range, roots.codex)).totals.requests,
      0,
    );
    await log(path, records);
    const report = await readNativePerformance(range, roots.codex);
    assert.equal(report.totals.requests, 1);
    assert.equal(report.totals.speed?.value, 100);
  }));
