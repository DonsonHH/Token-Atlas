import assert from "node:assert/strict";
import test from "node:test";
import { createEmptyTotals } from "../lib/usage-domain";
import { assembleUsageSnapshot } from "../lib/usage-snapshot";
import { resolveUsageRange } from "../lib/usage-range";
import { buildTrend, calendarPeriods } from "../lib/usage-analytics";
import {
  validateUsageImport,
  validDeviceId,
} from "../lib/usage-import-validation";
import { assignModelColors } from "../lib/model-colors";
import type { UsagePeriod } from "../lib/usage-types";

function day(
  label: string,
  totalTokens: number,
  models: Record<string, number> = {},
): UsagePeriod {
  return {
    ...createEmptyTotals(),
    label,
    totalTokens,
    models: Object.fromEntries(
      Object.entries(models).map(([name, value]) => [
        name,
        { ...createEmptyTotals(), totalTokens: value },
      ]),
    ),
  };
}
const fixedNow = new Date("2026-10-11T01:00:00Z");
const range = resolveUsageRange(
  { start: "2026-10-05", end: "2026-10-11", timezone: "Asia/Shanghai" },
  fixedNow,
);

test("date scope uses the selected timezone and rejects invalid or reversed ranges", () => {
  assert.equal(
    resolveUsageRange({ days: 1, timezone: "America/Los_Angeles" }, fixedNow)
      .start,
    "2026-10-10",
  );
  assert.throws(() => resolveUsageRange({ start: "2026-02-30" }, fixedNow));
  assert.throws(() =>
    resolveUsageRange({ start: "2026-10-11", end: "2026-10-10" }, fixedNow),
  );
  assert.equal(
    resolveUsageRange({ start: "2020-01-01", end: "2020-01-03" }, fixedNow)
      .days,
    3,
  );
});

test("daily, weekly, monthly, models and export totals share the exact inclusive range", () => {
  const snapshot = assembleUsageSnapshot({
    range,
    source: "all",
    device: "all",
    imports: { devices: [], dailyByDevice: {}, warnings: [] },
    local: {
      daily: [
        day("2026-10-04", 999),
        day("2026-10-05", 10, { a: 10 }),
        day("2026-10-11", 20, { a: 20 }),
        day("2026-10-12", 888),
      ],
      sessions: [],
    },
  });
  assert.equal(snapshot.totals.totalTokens, 30);
  assert.equal(
    snapshot.weekly.reduce((sum, row) => sum + row.totalTokens, 0),
    30,
  );
  assert.equal(
    snapshot.monthly.reduce((sum, row) => sum + row.totalTokens, 0),
    30,
  );
  assert.equal(snapshot.models[0].totalTokens, 30);
});

test("mixed-agent imports cannot leak into a single-agent scope; failed local reads preserve imports", () => {
  const imported = {
    id: "external",
    name: "external",
    source: "all" as const,
    kind: "imported" as const,
    dailyEntries: 1,
    latestDate: "2026-10-05",
    updatedAt: null,
  };
  const imports = {
    devices: [imported],
    dailyByDevice: { external: [day("2026-10-05", 100)] },
    warnings: [],
  };
  const codex = assembleUsageSnapshot({
    range,
    source: "codex",
    device: "all",
    imports,
    local: { daily: [], sessions: [], error: "failed" },
  });
  assert.equal(codex.totals.totalTokens, 0);
  assert.equal(codex.warnings.length, 2);
  const all = assembleUsageSnapshot({
    range,
    source: "all",
    device: "all",
    imports,
    local: { daily: [], sessions: [], error: "failed" },
  });
  assert.equal(all.totals.totalTokens, 100);
  assert.deepEqual(all.activeDeviceIds, ["external"]);
});

test("model stacks conserve the tail and unknown amounts and keep low-volume series first", () => {
  const report = [
    day("2026-10-05", 100, { a: 30, b: 20, c: 10, d: 5, e: 4, f: 3, g: 2 }),
  ];
  const chart = buildTrend(report, "tokens", true);
  assert.equal(
    chart.series.reduce((sum, item) => sum + item.total, 0),
    100,
  );
  assert.ok(chart.series.some((item) => item.key === "others"));
  assert.ok(chart.series.some((item) => item.key === "unassigned"));
  assert.deepEqual(
    chart.series.map((item) => item.total),
    chart.series.map((item) => item.total).sort((a, b) => a - b),
  );
});

test("moving averages include empty calendar dates and follow the chosen metric", () => {
  const daily = [
    { ...day("2026-10-05", 700), cacheReadTokens: 70 },
    { ...day("2026-10-11", 1400), cacheReadTokens: 140 },
  ];
  const periods = calendarPeriods(daily, range, "daily");
  assert.equal(periods.length, 7);
  assert.equal(buildTrend(periods, "cacheRead", false).rows[6].average, 30);
  assert.equal(buildTrend(periods, "tokens", false).rows[6].average, 300);
});

test("imports reject duplicate dates, invalid IDs and combined devices and strip unrelated content", () => {
  assert.equal(validDeviceId("../local"), false);
  assert.equal(validDeviceId("local"), false);
  assert.throws(
    () =>
      validateUsageImport(
        {
          daily: [
            { date: "2026-10-05", totalTokens: 10 },
            { date: "2026-10-05", totalTokens: 20 },
          ],
        },
        "Jetson",
        "codex",
      ),
    /重复/,
  );
  assert.throws(() =>
    validateUsageImport(
      { activeDeviceIds: ["local", "jetson"], daily: [day("2026-10-05", 10)] },
      "Jetson",
      "codex",
    ),
  );
  const result = validateUsageImport(
    { messages: ["private"], daily: [day("2026-10-05", 10)] },
    "Jetson",
    "codex",
  );
  assert.equal("messages" in result, false);
  assert.equal(result.daily[0].totalTokens, 10);
  assert.equal(result.exportedAt, null);
  assert.throws(
    () =>
      validateUsageImport(
        {
          daily: [
            {
              date: "2026-10-05",
              totalTokens: 10,
              models: { a: { totalTokens: -2 } },
            },
          ],
        },
        "Jetson",
        "codex",
      ),
    /无效/,
  );
});

test("new model names get distinct colours within the shared catalogue regardless of input order", () => {
  const names = [
    "gpt-6-sol",
    "gpt-6-astra",
    "gpt-6.1-sol",
    "gpt-6-luna",
    "unknown-a",
    "unknown-b",
  ];
  const first = assignModelColors(names);
  assert.equal(new Set(Object.values(first)).size, names.length);
  assert.deepEqual(first, assignModelColors(names.slice().reverse()));
});
