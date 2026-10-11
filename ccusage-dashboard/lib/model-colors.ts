/**
 * A categorical palette deliberately separate from the five general-purpose
 * chart tokens. General tokens are tuned for metric charts and include close
 * blue/yellow shades; a categorical breakdown needs much stronger separation.
 */
const categoricalPalette = [
  "var(--model-1)",
  "var(--model-2)",
  "var(--model-3)",
  "var(--model-4)",
  "var(--model-5)",
  "var(--model-6)",
  "var(--model-7)",
  "var(--model-8)",
  "var(--model-9)",
  "var(--model-10)",
  "var(--model-11)",
  "var(--model-12)",
] as const;

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
};

function stableHash(value: string) {
  let hash = 2_166_136_261;

  for (const character of value) {
    hash ^= character.charCodeAt(0);
    hash = Math.imul(hash, 16_777_619);
  }

  return hash >>> 0;
}

function getCategoricalColor(index: number) {
  return categoricalPalette[Math.abs(index) % categoricalPalette.length];
}

const aggregateModelColor = "var(--muted-foreground)";

/** Resolve hash collisions once against the whole displayed model catalogue. */
function assignModelColors(names: string[]): Record<string, string> {
  const sorted = [...new Set(names)].sort((a, b) => {
    const aNamed = Object.hasOwn(namedModelSlots, a.trim().toLowerCase());
    const bNamed = Object.hasOwn(namedModelSlots, b.trim().toLowerCase());
    return Number(bNamed) - Number(aNamed) || a.localeCompare(b);
  });
  const used = new Set<number>();
  return Object.fromEntries(
    sorted.map((name) => {
      const normalized = name.trim().toLowerCase();
      const preferred = Object.hasOwn(namedModelSlots, normalized)
        ? namedModelSlots[normalized]
        : stableHash(normalized) % categoricalPalette.length;
      let slot = preferred;
      while (used.has(slot) && used.size < categoricalPalette.length)
        slot = (slot + 1) % categoricalPalette.length;
      const color =
        used.size >= categoricalPalette.length
          ? `oklch(var(--model-lightness) 0.13 ${(stableHash(normalized) * 137.508) % 360})`
          : getCategoricalColor(slot);
      used.add(slot);
      return [name, color];
    }),
  );
}

export { aggregateModelColor, assignModelColors };
