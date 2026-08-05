import assert from "node:assert/strict";
import test from "node:test";

import {
  mergeUsagePeriods,
  selectUsageDevices,
  usageTotalsFrom,
  weeklyUsagePeriods,
} from "../lib/usage-domain";
import {
  buildUsageViewExport,
  usageExportFileName,
} from "../lib/usage-export";
import type {
  UsagePeriod,
  UsageSnapshot,
  UsageTotals,
} from "../lib/usage-types";

const emptyTotals: UsageTotals = {
  cacheCreationTokens: 0,
  cacheReadTokens: 0,
  costUSD: 0,
  inputTokens: 0,
  outputTokens: 0,
  reasoningOutputTokens: 0,
  totalTokens: 0,
};

function period(
  label: string,
  tokens: number,
  models: UsagePeriod["models"] = {}
): UsagePeriod {
  return {
    ...emptyTotals,
    label,
    models,
    totalTokens: tokens,
  };
}

test("normalizes numeric fields and derives missing totals", () => {
  assert.deepEqual(
    usageTotalsFrom({
      cacheReadTokens: "5",
      costUSD: "1.25",
      inputTokens: "10",
      outputTokens: 2,
      reasoningOutputTokens: 3,
    }),
    {
      cacheCreationTokens: 0,
      cacheReadTokens: 5,
      costUSD: 1.25,
      inputTokens: 10,
      outputTokens: 2,
      reasoningOutputTokens: 3,
      totalTokens: 20,
    }
  );
});

test("merges matching periods and their model totals", () => {
  const merged = mergeUsagePeriods(
    [
      period("2026-08-01", 10, {
        "gpt-5": { ...emptyTotals, totalTokens: 10 },
      }),
    ],
    [
      period("2026-08-01", 20, {
        "gpt-5": { ...emptyTotals, totalTokens: 5 },
        "gpt-5-mini": { ...emptyTotals, totalTokens: 15 },
      }),
    ]
  );

  assert.equal(merged.length, 1);
  assert.equal(merged[0]?.totalTokens, 30);
  assert.equal(merged[0]?.models["gpt-5"]?.totalTokens, 15);
  assert.equal(merged[0]?.models["gpt-5-mini"]?.totalTokens, 15);
});

test("starts ISO weeks on Monday across a month boundary", () => {
  const weekly = weeklyUsagePeriods([
    period("2026-08-02", 10),
    period("2026-08-03", 20),
  ]);

  assert.deepEqual(
    weekly.map((item) => [item.label, item.totalTokens]),
    [
      ["2026-07-27", 10],
      ["2026-08-03", 20],
    ]
  );
});

test("limits device selection to known imports or the local aggregate", () => {
  const importedDevices: UsageSnapshot["devices"] = [
    {
      dailyEntries: 2,
      id: "jetson",
      kind: "imported",
      latestDate: "2026-08-01",
      name: "Jetson",
      source: "codex",
      updatedAt: "2026-08-01T12:00:00.000Z",
    },
  ];

  assert.deepEqual(selectUsageDevices("jetson", importedDevices), {
    activeDeviceIds: ["jetson"],
    includeLocal: false,
    selectedImportedDevices: importedDevices,
  });
  assert.deepEqual(selectUsageDevices("unknown", importedDevices).activeDeviceIds, [
    "local",
    "jetson",
  ]);
});

test("exports only active devices and produces safe names", () => {
  const snapshot: UsageSnapshot = {
    activeDeviceIds: ["jetson"],
    daily: [],
    dataPath: "~/.codex",
    devices: [
      {
        dailyEntries: 1,
        id: "local",
        kind: "local",
        latestDate: "2026-08-01",
        name: "本机",
        source: "all",
        updatedAt: "2026-08-01T12:00:00.000Z",
      },
      {
        dailyEntries: 2,
        id: "jetson",
        kind: "imported",
        latestDate: "2026-08-01",
        name: "Jetson",
        source: "codex",
        updatedAt: "2026-08-01T12:00:00.000Z",
      },
    ],
    generatedAt: "2026-08-04T12:00:00.000Z",
    mode: "live",
    models: [],
    monthly: [],
    offline: true,
    raw: {},
    reader: "ccusage",
    sessions: [],
    source: "codex",
    totals: emptyTotals,
    weekly: [],
    weeklyMethod: "daily-derived",
  };

  assert.deepEqual(
    buildUsageViewExport(snapshot, "codex").devices.map((device) => device.id),
    ["jetson"]
  );
  assert.equal(
    usageExportFileName("usage-view", "../../jetson import", snapshot.generatedAt),
    "usage-view-jetson-import-2026-08-04.json"
  );
});
