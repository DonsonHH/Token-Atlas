import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import test from "node:test";

const normalizer = resolve("scripts/normalize-usage.mjs");

test("clipboard CLI uses the shared validator, preserves pricing metadata and strips content", () => {
  const result = spawnSync(
    process.execPath,
    [normalizer, "测试设备", "codex"],
    {
      input: JSON.stringify({
        readerVersion: "20.0.30",
        exportedAt: "2026-10-13T00:00:00Z",
        messages: ["private content must not be saved"],
        daily: [
          {
            date: "2026-10-05",
            totalTokens: 20,
            costUSD: 0,
            messages: ["also strip row content"],
            models: {
              unpriced: {
                totalTokens: 20,
                missingPricing: true,
                messages: ["model content"],
              },
            },
          },
        ],
      }),
      encoding: "utf8",
    },
  );
  assert.equal(result.status, 0, result.stderr);
  const report = JSON.parse(result.stdout);
  assert.equal(report.deviceName, "测试设备");
  assert.equal(report.readerVersion, "20.0.30");
  assert.deepEqual(report.daily[0].unpricedModels, ["unpriced"]);
  assert.equal(result.stdout.includes("messages"), false);
  assert.equal(result.stdout.includes("private content"), false);
});

test("clipboard CLI rejects invalid reports before returning anything to persist", () => {
  const result = spawnSync(
    process.execPath,
    [normalizer, "External", "codex"],
    {
      input: JSON.stringify({
        daily: [{ date: "2026-02-30", totalTokens: 20 }],
      }),
      encoding: "utf8",
    },
  );
  assert.equal(result.status, 1);
  assert.equal(result.stdout, "");
  assert.match(result.stderr, /无效日期/);
});
