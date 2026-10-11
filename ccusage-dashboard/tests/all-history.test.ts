import assert from "node:assert/strict";
import test from "node:test";
import { resolveUsageRange } from "../lib/usage-range";
import { assembleUsageSnapshot } from "../lib/usage-snapshot";
import { createEmptyTotals } from "../lib/usage-domain";
import { calendarPeriods } from "../lib/usage-analytics";
import { validateUsageImport } from "../lib/usage-import-validation";
import { workspaceQuery, workspaceState } from "../lib/workspace-state";

const now = new Date("2026-10-11T12:00:00Z");
const row = (label: string, totalTokens: number) => ({
  ...createEmptyTotals(),
  label,
  totalTokens,
  models: {},
});

test("all-history includes records older than a year and resolves actual selected coverage", () => {
  const request = resolveUsageRange(
    { days: "all", timezone: "Asia/Shanghai" },
    now,
  );
  const imports = {
    devices: [
      {
        id: "external",
        name: "External",
        kind: "imported" as const,
        source: "all" as const,
        dailyEntries: 1,
        latestDate: "2021-01-01",
        updatedAt: null,
      },
    ],
    dailyByDevice: { external: [row("2021-01-01", 10)] },
    warnings: [],
  };
  const local = {
    daily: [
      row("2022-01-01", 20),
      row("2026-10-07", 30),
      row("2026-10-12", 999),
    ],
    sessions: [],
  };
  const combined = assembleUsageSnapshot({
    range: request,
    source: "all",
    device: "all",
    imports,
    local,
  });
  assert.equal(combined.range.start, "2021-01-01");
  assert.equal(combined.range.end, "2026-10-07");
  assert.equal(combined.range.allTime, true);
  assert.ok(combined.range.days > 366);
  assert.equal(combined.totals.totalTokens, 60);
  for (const grain of ["daily", "weekly", "monthly"] as const) {
    const periods = calendarPeriods(combined.daily, combined.range, grain);
    assert.equal(
      periods.reduce((sum, period) => sum + period.totalTokens, 0),
      60,
    );
  }
  const codex = assembleUsageSnapshot({
    range: request,
    source: "codex",
    device: "all",
    imports,
    local,
  });
  assert.equal(codex.range.start, "2022-01-01");
  assert.equal(codex.totals.totalTokens, 50);
  const external = assembleUsageSnapshot({
    range: request,
    source: "all",
    device: "external",
    imports,
    local,
  });
  assert.equal(external.range.days, 1);
  assert.equal(external.range.end, "2021-01-01");
  assert.equal(external.sessionStatus, "aggregate-only");
});

test("all-history URL survives a round trip and conflicts with explicit bounds are rejected", () => {
  const state = workspaceState(
    new URLSearchParams("view=analysis&days=all&grain=monthly"),
  );
  assert.equal(
    workspaceState(new URLSearchParams(workspaceQuery(state))).days,
    "all",
  );
  assert.throws(
    () => resolveUsageRange({ days: "all", start: "2024-01-01" }, now),
    /全部日期/,
  );
  const empty = assembleUsageSnapshot({
    range: resolveUsageRange({ days: "all" }, now),
    device: "all",
    source: "all",
    imports: { devices: [], dailyByDevice: {}, warnings: [] },
    local: { daily: [], sessions: [] },
  });
  assert.equal(empty.totals.totalTokens, 0);
  assert.equal(empty.range.days, 1);
});

test("import validates the same date and model fields that normalization consumes", () => {
  assert.throws(
    () =>
      validateUsageImport(
        {
          daily: [
            {
              date: "2026-10-01",
              totalTokens: 10,
              models: { a: { totalTokens: -1 } },
              modelBreakdowns: [{ modelName: "a", totalTokens: 1 }],
            },
          ],
        },
        "Device",
        "codex",
      ),
    /无效/,
  );
  assert.throws(
    () =>
      validateUsageImport(
        {
          daily: [
            {
              date: "2026-10-01",
              totalTokens: 10,
              models: { a: { totalTokens: 20 } },
            },
          ],
        },
        "Device",
        "codex",
      ),
    /超过/,
  );
  const normalized = validateUsageImport(
    {
      daily: [
        { period: "2026-10-01", week: "bad-week-label", totalTokens: 10 },
      ],
    },
    "Device",
    "codex",
  );
  assert.equal(normalized.daily.length, 1);
  assert.equal(normalized.daily[0].date, "2026-10-01");
});
