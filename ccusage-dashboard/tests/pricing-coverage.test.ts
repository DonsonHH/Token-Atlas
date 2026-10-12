import assert from "node:assert/strict";
import test from "node:test";

import {
  addUsageTotals,
  createEmptyTotals,
  monthlyUsagePeriods,
  usagePeriodsFrom,
  usageSessionsFrom,
  weeklyUsagePeriods,
} from "../lib/usage-domain";
import { buildTrend, calendarPeriods } from "../lib/usage-analytics";
import { assembleUsageSnapshot } from "../lib/usage-snapshot";
import { resolveUsageRange } from "../lib/usage-range";
import { validateUsageImport } from "../lib/usage-import-validation";
import { pricingState, referenceCostLabel } from "../lib/usage-pricing";
import { buildUsageViewExport } from "../lib/usage-export";

const report = {
  daily: [
    {
      period: "2026-10-05",
      inputTokens: 10,
      outputTokens: 2,
      cacheReadTokens: 8,
      totalTokens: 20,
      totalCost: 0,
      modelBreakdowns: [
        {
          modelName: "new-unpriced-model",
          inputTokens: 10,
          outputTokens: 2,
          cacheReadTokens: 8,
          cost: 0,
          missingPricing: true,
        },
      ],
    },
  ],
  session: [
    {
      period: "session-a",
      totalTokens: 20,
      totalCost: 0,
      modelBreakdowns: [
        {
          modelName: "new-unpriced-model",
          totalTokens: 20,
          cost: 0,
          missingPricing: true,
        },
      ],
    },
  ],
  totals: {
    totalTokens: 20,
    totalCost: 0,
    unpricedModels: ["new-unpriced-model"],
  },
};

test("upstream missing-price metadata survives normalization and daily/weekly/monthly aggregation", () => {
  const daily = usagePeriodsFrom(report, "daily");
  for (const row of [
    daily[0],
    weeklyUsagePeriods(daily)[0],
    monthlyUsagePeriods(daily)[0],
    addUsageTotals(createEmptyTotals(), daily[0]),
    usageSessionsFrom(report)[0],
  ]) {
    assert.ok("unpricedModels" in row);
    assert.deepEqual(row.unpricedModels, ["new-unpriced-model"]);
  }
  const model = daily[0].models["new-unpriced-model"];
  assert.ok("missingPricing" in model && model.missingPricing === true);
});

test("missing prices render as chart gaps instead of zero-cost points and averages", () => {
  const daily = usagePeriodsFrom(report, "daily");
  const range = resolveUsageRange(
    { start: "2026-10-05", end: "2026-10-06" },
    new Date("2026-10-07T12:00:00Z"),
  );
  const chart = buildTrend(
    calendarPeriods(daily, range, "daily"),
    "cost",
    false,
  );
  assert.equal(chart.rows[0].value, null);
  assert.equal(chart.rows[0].average, null);
  assert.equal(
    chart.rows[1].value,
    0,
    "an empty calendar date remains an actual zero",
  );
  assert.equal(
    chart.rows[1].average,
    null,
    "unknown costs must not lower the rolling average",
  );
});

test("snapshot and imported report retain price diagnostics without inventing rates", () => {
  const range = resolveUsageRange(
    { start: "2026-10-05", end: "2026-10-05" },
    new Date("2026-10-07T12:00:00Z"),
  );
  const imported = validateUsageImport(report, "External", "codex");
  const snapshot = assembleUsageSnapshot({
    range,
    source: "all",
    device: "all",
    local: { daily: usagePeriodsFrom(imported, "daily"), sessions: [] },
    imports: { devices: [], dailyByDevice: {}, warnings: [] },
  });
  assert.ok(
    snapshot.warnings.some((warning) => warning.includes("new-unpriced-model")),
  );
  assert.equal(snapshot.totals.costUSD, 0);
  assert.equal(snapshot.totals.totalTokens, 20);
});

test("same-name model entries across agents are summed without losing missing prices", () => {
  const [day] = usagePeriodsFrom(
    {
      daily: [
        {
          period: "2026-10-05",
          totalTokens: 30,
          totalCost: 0.5,
          modelBreakdowns: [
            {
              modelName: "shared-model",
              agent: "codex",
              totalTokens: 20,
              cost: 0,
              missingPricing: true,
            },
            {
              modelName: "shared-model",
              agent: "opencode",
              totalTokens: 10,
              cost: 0.5,
            },
          ],
        },
      ],
    },
    "daily",
  );
  assert.equal(day.models["shared-model"].totalTokens, 30);
  assert.equal(day.models["shared-model"].costUSD, 0.5);
  assert.equal(day.models["shared-model"].missingPricing, true);
  assert.deepEqual(day.unpricedModels, ["shared-model"]);
  assert.equal(pricingState(day), "partial");
  assert.equal(referenceCostLabel(day), "≥ $0.50");
});

test("focused reports preserve missing prices; old active zero-cost reports remain unconfirmed", () => {
  const [explicit] = usagePeriodsFrom(
    {
      daily: [
        {
          date: "2026-10-05",
          totalTokens: 20,
          costUSD: 0,
          models: {
            "new-unpriced-model": { totalTokens: 20, missingPricing: true },
          },
        },
      ],
    },
    "daily",
  );
  assert.deepEqual(explicit.unpricedModels, ["new-unpriced-model"]);
  assert.equal(referenceCostLabel(explicit), "待定价");

  const [legacy] = usagePeriodsFrom(
    { daily: [{ date: "2026-10-05", totalTokens: 20, costUSD: 0 }] },
    "daily",
  );
  assert.equal(legacy.pricingUnknown, true);
  assert.equal(pricingState(legacy), "unavailable");
  assert.equal(pricingState(createEmptyTotals()), "complete");
});

test("re-exported external pricing retains its reader provenance instead of using the local version", () => {
  const range = resolveUsageRange({ start: "2026-10-05", end: "2026-10-05" });
  const imported = {
    id: "external",
    kind: "imported" as const,
    name: "External",
    source: "codex" as const,
    dailyEntries: 1,
    latestDate: "2026-10-05",
    updatedAt: null,
    readerVersion: "20.0.19",
  };
  const snapshot = {
    ...assembleUsageSnapshot({
      range,
      source: "all",
      device: "external",
      local: null,
      imports: {
        devices: [imported],
        dailyByDevice: { external: usagePeriodsFrom(report, "daily") },
        warnings: [],
      },
    }),
    readerVersion: "20.0.30",
  };
  assert.equal(buildUsageViewExport(snapshot, "all").readerVersion, "20.0.19");
  snapshot.devices[1].readerVersion = undefined;
  assert.equal(buildUsageViewExport(snapshot, "all").readerVersion, undefined);
});
