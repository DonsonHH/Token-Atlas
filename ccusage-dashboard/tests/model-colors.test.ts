import assert from "node:assert/strict";
import test from "node:test";

import { assignModelColors } from "../lib/model-colors";

test("gives simultaneously visible model variants distinct categorical colours", () => {
  const visibleModels = [
    "gpt-5.6-sol",
    "gpt-5.6-terra",
    "gpt-5.5",
    "gpt-5.6-luna",
    "deepseek-v4-flash",
  ];

  const colors = Object.values(assignModelColors(visibleModels));

  assert.equal(
    new Set(colors).size,
    visibleModels.length,
    "a model breakdown cannot reuse a colour for two concurrently visible models",
  );
});

test("preserves established model colours when unknown models join the catalogue", () => {
  const baseline = assignModelColors(["gpt-5.6-sol", "gpt-5.6-terra"]);
  const expanded = assignModelColors([
    "gpt-5.6-sol",
    "gpt-5.6-terra",
    ...Array.from({ length: 12 }, (_, i) => `custom-model-${i}`),
  ]);
  assert.equal(expanded["gpt-5.6-sol"], baseline["gpt-5.6-sol"]);
  assert.equal(expanded["gpt-5.6-terra"], baseline["gpt-5.6-terra"]);
});
