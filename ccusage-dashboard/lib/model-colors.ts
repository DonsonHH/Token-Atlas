/**
 * A categorical palette deliberately separate from the five general-purpose
 * chart tokens. General tokens are tuned for metric charts and include close
 * blue/yellow shades; a categorical breakdown needs much stronger separation.
 */
const categoricalPalette = [
  "oklch(0.67 0.2 255)",
  "oklch(0.73 0.16 160)",
  "oklch(0.76 0.17 70)",
  "oklch(0.68 0.21 315)",
  "oklch(0.69 0.19 25)",
  "oklch(0.69 0.17 345)",
  "oklch(0.74 0.17 125)",
  "oklch(0.7 0.16 205)",
  "oklch(0.69 0.18 285)",
  "oklch(0.65 0.2 10)",
  "oklch(0.7 0.15 185)",
  "oklch(0.72 0.14 95)",
] as const

const namedModelSlots: Record<string, number> = {
  "claude-opus-5": 5,
  "codex-auto-review": 8,
  "deepseek-v4-flash": 4,
  "gpt-5.4": 6,
  "gpt-5.4-mini": 7,
  "gpt-5.5": 2,
  "gpt-5.6-luna": 3,
  "gpt-5.6-sol": 0,
  "gpt-5.6-terra": 1,
  "grok-4.5": 9,
}

function stableHash(value: string) {
  let hash = 2_166_136_261

  for (const character of value) {
    hash ^= character.charCodeAt(0)
    hash = Math.imul(hash, 16_777_619)
  }

  return hash >>> 0
}

function getCategoricalColor(index: number) {
  return categoricalPalette[Math.abs(index) % categoricalPalette.length]
}

/**
 * Keeps a model's visual identity stable across every chart and table.
 *
 * Named common models get explicitly assigned, well-separated colour slots.
 * Other names use a stable hash instead of current rank, so their identity is
 * retained when filters or date ranges change.
 */
function getModelColor(name: string) {
  const normalizedName = name.trim().toLocaleLowerCase()
  const namedSlot = namedModelSlots[normalizedName]

  return getCategoricalColor(namedSlot ?? stableHash(normalizedName))
}

const aggregateModelColor = "var(--muted-foreground)"

export { aggregateModelColor, getCategoricalColor, getModelColor }
