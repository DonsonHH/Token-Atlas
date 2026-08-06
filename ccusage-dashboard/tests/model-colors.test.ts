import assert from "node:assert/strict"
import test from "node:test"

import { getCategoricalColor, getModelColor } from "../lib/model-colors"

test("gives simultaneously visible model variants distinct categorical colours", () => {
  const visibleModels = [
    "gpt-5.6-sol",
    "gpt-5.6-terra",
    "gpt-5.5",
    "gpt-5.6-luna",
    "deepseek-v4-flash",
  ]

  const colors = visibleModels.map(getModelColor)

  assert.equal(
    new Set(colors).size,
    visibleModels.length,
    "a model breakdown cannot reuse a colour for two concurrently visible models"
  )
})

test("keeps the first categorical project colours distinct", () => {
  const colors = Array.from({ length: 8 }, (_, index) => getCategoricalColor(index))

  assert.equal(new Set(colors).size, colors.length)
})
