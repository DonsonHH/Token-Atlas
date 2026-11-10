import assert from "node:assert/strict";
import test from "node:test";
import {
  deepseekPricePeriod,
  deepseekReferenceCostUSD,
  dshPricingMetadata,
} from "../lib/deepseek-pricing";

const usage = {
  inputTokens: 1_000_000,
  cacheReadTokens: 1_000_000,
  outputTokens: 1_000_000,
  cacheCreationTokens: 0,
};
const at = (time: string) => new Date(time);

test("official Flash and Pro dollar rates price input, cached input and output separately", () => {
  assert.equal(
    deepseekReferenceCostUSD(
      "deepseek-flash",
      usage,
      at("2026-11-10T00:00:00Z"),
    ),
    0.753,
  );
  assert.equal(
    deepseekReferenceCostUSD(
      "deepseek-v4-pro",
      usage,
      at("2026-11-10T00:00:00Z"),
    ),
    2.662,
  );
  assert.equal(
    deepseekReferenceCostUSD(
      "deepseek-v4-pro",
      usage,
      at("2026-11-10T01:30:00Z"),
    ),
    5.324,
  );
});

test("Beijing peak intervals include their starts and exclude their ends", () => {
  const cases = [
    ["00:59:59", "off-peak"],
    ["01:00:00", "peak"],
    ["03:59:59", "peak"],
    ["04:00:00", "off-peak"],
    ["05:59:59", "off-peak"],
    ["06:00:00", "peak"],
    ["09:59:59", "peak"],
    ["10:00:00", "off-peak"],
  ];
  for (const [time, expected] of cases)
    assert.equal(
      deepseekPricePeriod(at(`2026-11-10T${time}Z`)),
      expected,
      time,
    );
});

test("weekends including make-up workdays stay off-peak", () => {
  for (const date of ["2026-11-07", "2026-11-08", "2026-10-10", "2027-02-14"]) {
    assert.equal(
      deepseekPricePeriod(at(`${date}T01:30:00Z`)),
      "off-peak",
      date,
    );
  }
});

test("official 2026 and 2027 holiday breaks override weekday peak times", () => {
  for (const date of [
    "2026-01-01",
    "2026-02-23",
    "2026-04-06",
    "2026-05-05",
    "2026-06-19",
    "2026-09-25",
    "2026-10-07",
    "2027-02-05",
    "2027-06-09",
    "2027-09-15",
  ]) {
    assert.equal(
      deepseekPricePeriod(at(`${date}T01:30:00Z`)),
      "off-peak",
      date,
    );
  }
  assert.equal(deepseekPricePeriod(at("2026-10-08T01:30:00Z")), "peak");
  assert.equal(deepseekPricePeriod(at("2027-06-10T01:30:00Z")), "peak");
});

test("known aliases use the documented family but unknown model names remain unpriced", () => {
  for (const model of [
    "deepseek-v4.1-flash",
    "deepseek-v4-flash",
    "deepseek-v4-flash-vision-exp",
    "DeepSeek-V4.1-Flash-1017",
    "deepseek/deepseek-flash",
  ]) {
    assert.equal(
      deepseekReferenceCostUSD(model, usage, at("2026-11-10T00:00:00Z")),
      0.753,
      model,
    );
  }
  for (const model of ["deepseek-chat", "deepseek-v99", "other/deepseek-flash"])
    assert.equal(
      deepseekReferenceCostUSD(model, usage, at("2026-11-10T00:00:00Z")),
      null,
    );
});

test("unknown holiday years, invalid dates and unsupported cache-write charges are not guessed", () => {
  assert.equal(
    deepseekReferenceCostUSD(
      "deepseek-flash",
      usage,
      at("2028-01-04T01:30:00Z"),
    ),
    null,
  );
  assert.equal(deepseekPricePeriod(at("2028-01-08T01:30:00Z")), "off-peak");
  assert.equal(
    deepseekReferenceCostUSD("deepseek-flash", usage, new Date(NaN)),
    null,
  );
  assert.equal(
    deepseekReferenceCostUSD(
      "deepseek-flash",
      { ...usage, cacheCreationTokens: 1 },
      at("2026-11-10T00:00:00Z"),
    ),
    null,
  );
  assert.equal(
    deepseekReferenceCostUSD(
      "deepseek-flash",
      { ...usage, inputTokens: -1 },
      at("2026-11-10T00:00:00Z"),
    ),
    null,
  );
  assert.equal(
    deepseekReferenceCostUSD(
      "deepseek-flash",
      { ...usage, inputTokens: Number.MAX_SAFE_INTEGER },
      at("2026-11-10T00:00:00Z"),
    ),
    null,
  );
});

test("pricing follows Beijing instants rather than the display timezone", () => {
  assert.equal(
    deepseekReferenceCostUSD(
      "deepseek-flash",
      usage,
      at("2026-11-10T09:30:00+08:00"),
    ),
    1.506,
  );
  assert.equal(
    deepseekReferenceCostUSD(
      "deepseek-flash",
      usage,
      at("2026-11-09T20:30:00-05:00"),
    ),
    1.506,
  );
});

test("external-only snapshots never claim the local current price card repriced their data", () => {
  assert.equal(
    dshPricingMetadata({ reader: "dsh", activeDeviceIds: ["external"] }),
    undefined,
  );
  assert.equal(
    dshPricingMetadata({ reader: "ccusage", activeDeviceIds: ["local"] }),
    undefined,
  );
  assert.equal(
    dshPricingMetadata({ reader: "dsh", activeDeviceIds: ["local"] })?.currency,
    "USD",
  );
});
