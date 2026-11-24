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
import { searchableModelNames } from "../lib/model-names";

test("normalized session model names remain searchable by either Flash alias", () => {
  const [session] = usageSessionsFrom({
    sessions: [{ modelsUsed: ["deepseek-flash", "deepseek-v4.1-flash"] }],
  });
  const searchNames = session.models.flatMap(searchableModelNames);
  assert.deepEqual(session.models, ["deepseek-flash"]);
  assert.ok(searchNames.includes("deepseek-flash"));
  assert.ok(searchNames.includes("deepseek-v4.1-flash"));
  assert.deepEqual(searchableModelNames("deepseek-v4-flash"), [
    "deepseek-v4-flash",
  ]);
});

test("ccusage and imported Flash aliases share one model without losing costs or missing-price diagnostics", () => {
  const [native] = usagePeriodsFrom(
    {
      daily: [
        {
          date: "2026-11-10",
          totalTokens: 78,
          totalCost: 0.5,
          modelBreakdowns: [
            { modelName: "deepseek-flash", totalTokens: 30, cost: 0.5 },
            {
              modelName: "deepseek-v4.1-flash",
              totalTokens: 40,
              cost: 0,
              missingPricing: true,
            },
            { modelName: "deepseek-v4-flash", totalTokens: 5 },
            { modelName: "deepseek-v4-pro", totalTokens: 3 },
          ],
        },
      ],
      totals: { unpricedModels: ["deepseek-v4.1-flash"] },
    },
    "daily",
  );
  assert.equal(native.totalTokens, 78);
  assert.equal(native.costUSD, 0.5);
  assert.deepEqual(native.unpricedModels, ["deepseek-flash"]);
  assert.equal(native.models["deepseek-flash"].totalTokens, 70);
  assert.equal(native.models["deepseek-flash"].costUSD, 0.5);
  assert.equal(native.models["deepseek-flash"].missingPricing, true);
  assert.equal(native.models["deepseek-v4-flash"].totalTokens, 5);
  assert.equal(native.models["deepseek-v4-pro"].totalTokens, 3);

  const imported = validateUsageImport(
    {
      daily: [
        {
          date: "2026-11-10",
          totalTokens: 70,
          costUSD: 0.75,
          models: {
            "deepseek-v4.1-flash": { totalTokens: 40, costUSD: 0.5 },
            "deepseek-flash": { totalTokens: 30, costUSD: 0.25 },
          },
        },
      ],
    },
    "External",
    "codex",
  );
  assert.deepEqual(Object.keys(imported.daily[0].models), ["deepseek-flash"]);
  assert.equal(imported.daily[0].models["deepseek-flash"].totalTokens, 70);
  assert.equal(imported.daily[0].models["deepseek-flash"].costUSD, 0.75);
  assert.deepEqual(
    usageSessionsFrom({
      sessions: [{ modelsUsed: ["deepseek-v4.1-flash", "deepseek-flash"] }],
    })[0].models,
    ["deepseek-flash"],
  );
});

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

test("Flash pricing warnings stay on the affected day and session after alias grouping", () => {
  for (const explicitFlag of [true, false]) {
    const priced = {
      date: "2026-11-10",
      sessionId: "priced",
      totalTokens: 100,
      costUSD: 0.25,
      models: { "deepseek-flash": { totalTokens: 100, costUSD: 0.25 } },
    };
    const unpriced = {
      date: "2026-11-11",
      sessionId: "unpriced",
      totalTokens: 50,
      costUSD: 0,
      modelBreakdowns: [
        {
          modelName: "deepseek-v4.1-flash",
          totalTokens: 50,
          ...(explicitFlag ? { missingPricing: true } : {}),
        },
      ],
    };
    const native = {
      daily: [priced, unpriced],
      sessions: [priced, unpriced],
      totals: { unpricedModels: ["deepseek-v4.1-flash"] },
    };
    const days = usagePeriodsFrom(native, "daily");
    assert.deepEqual(days.map(pricingState), ["complete", "unavailable"]);
    assert.deepEqual(
      buildTrend(days, "cost", false).rows.map((row) => row.value),
      [0.25, null],
    );
    assert.deepEqual(days[1].unpricedModels, ["deepseek-flash"]);
    const sessions = usageSessionsFrom(native);
    assert.equal(
      sessions.find(({ id }) => id === "priced")?.unpricedModels,
      undefined,
    );
    assert.deepEqual(
      sessions.find(({ id }) => id === "unpriced")?.unpricedModels,
      ["deepseek-flash"],
    );
  }
});

test("scoped price warnings do not spread when a normalized export is re-imported", () => {
  const daily = usagePeriodsFrom(
    {
      daily: [
        {
          date: "2026-11-10",
          totalTokens: 100,
          costUSD: 0.25,
          models: { "deepseek-flash": { totalTokens: 100, costUSD: 0.25 } },
        },
        {
          date: "2026-11-11",
          totalTokens: 50,
          costUSD: 0,
          models: {
            "deepseek-flash": { totalTokens: 50, missingPricing: true },
          },
        },
      ],
    },
    "daily",
  );
  const range = resolveUsageRange(
    { start: "2026-11-10", end: "2026-11-11" },
    new Date("2026-11-12T12:00:00Z"),
  );
  const snapshot = assembleUsageSnapshot({
    range,
    source: "dsh",
    device: "local",
    local: { daily, sessions: [] },
    imports: { devices: [], dailyByDevice: {}, warnings: [] },
  });
  const exported = buildUsageViewExport(snapshot, "dsh");
  const imported = validateUsageImport(exported, "External", "dsh");
  assert.deepEqual(imported.daily.map(pricingState), [
    "complete",
    "unavailable",
  ]);
  assert.equal(imported.daily[0].costUSD, 0.25);
});

test("a scoped warning elsewhere does not erase a legacy hint for a model with no confirmed price", () => {
  const flash = "deepseek-v4.1-flash";
  const daily = usagePeriodsFrom(
    {
      daily: [
        {
          date: "2026-11-10",
          totalTokens: 50,
          costUSD: 0,
          models: { [flash]: { totalTokens: 50, missingPricing: true } },
        },
        {
          date: "2026-11-11",
          totalTokens: 100,
          costUSD: 0.5,
          models: {
            [flash]: { totalTokens: 50, costUSD: 0 },
            other: { totalTokens: 50, costUSD: 0.5 },
          },
        },
        {
          date: "2026-11-12",
          totalTokens: 100,
          costUSD: 0.5,
          models: {
            [flash]: { totalTokens: 50, costUSD: 0, missingPricing: false },
            other: { totalTokens: 50, costUSD: 0.5 },
          },
        },
      ],
      totals: { unpricedModels: [flash] },
    },
    "daily",
  );
  assert.deepEqual(daily.map(pricingState), [
    "unavailable",
    "partial",
    "complete",
  ]);
  assert.deepEqual(daily[1].unpricedModels, ["deepseek-flash"]);
  assert.deepEqual(
    buildTrend(daily, "cost", false).rows.map(({ value }) => value),
    [null, null, 0.5],
  );
});

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

test("an individual DSH import re-exported from all-Agent scope keeps its source and original pricing", () => {
  const range = resolveUsageRange({ start: "2026-10-05", end: "2026-10-05" });
  const imported = {
    id: "external",
    kind: "imported" as const,
    name: "External",
    source: "dsh" as const,
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
  const exported = buildUsageViewExport(snapshot, "all");
  assert.equal(exported.source, "dsh");
  assert.equal(exported.reader, undefined);
  assert.equal(exported.readerVersion, "20.0.19");
  const roundTrip = validateUsageImport(
    exported,
    imported.name,
    exported.source,
  );
  const focused = assembleUsageSnapshot({
    range,
    source: "dsh",
    device: "external",
    local: null,
    imports: {
      devices: [{ ...imported, source: roundTrip.source }],
      dailyByDevice: { external: roundTrip.daily },
      warnings: [],
    },
  });
  assert.equal(focused.totals.totalTokens, snapshot.totals.totalTokens);
  assert.equal(focused.totals.costUSD, snapshot.totals.costUSD);
  snapshot.devices[1].readerVersion = undefined;
  assert.equal(buildUsageViewExport(snapshot, "all").readerVersion, undefined);
});

test("report-level missing prices survive positive-cost mixed reports and re-imports", () => {
  const row = {
    period: "2026-10-05",
    totalTokens: 30,
    totalCost: 0.5,
    modelBreakdowns: [
      { modelName: "priced-model", totalTokens: 10, cost: 0.5 },
      { modelName: "unpriced-model", totalTokens: 20, cost: 0 },
    ],
  };
  const mixedReport = {
    daily: [row],
    session: [{ ...row, period: "session-a" }],
    totals: { unpricedModels: ["unpriced-model"] },
  };
  const daily = usagePeriodsFrom(mixedReport, "daily");
  const imported = validateUsageImport(mixedReport, "External", "codex");
  for (const period of [
    daily[0],
    usageSessionsFrom(mixedReport)[0],
    usagePeriodsFrom(imported, "daily")[0],
  ]) {
    assert.deepEqual(period.unpricedModels, ["unpriced-model"]);
    assert.equal(referenceCostLabel(period), "≥ $0.50");
  }
  assert.equal(buildTrend(daily, "cost", false).rows[0].value, null);
});
