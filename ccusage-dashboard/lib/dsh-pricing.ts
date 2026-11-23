import { astraPricingReference, astraReferenceCostUSD } from "./astra-pricing";
import {
  deepseekPricingReference,
  deepseekReferenceCostUSD,
} from "./deepseek-pricing";
import type { UsageSnapshot, UsageTotals } from "./usage-types";

const opus55PricingReference = {
  id: "anthropic-opus-5-5-standard-usd-2026-11-21",
  source: "https://platform.claude.com/docs/en/about-claude/pricing",
  checkedAt: "2026-11-21",
  currency: "USD",
  serviceTier: "standard",
  cacheWriteTtl: "5m",
  basis:
    "按 Anthropic Standard 全球档与默认 5 分钟缓存写入价估算；非网关实际账单。",
} as const;

const references = {
  deepseek: deepseekPricingReference,
  astra: astraPricingReference,
  opus55: opus55PricingReference,
} as const;

export type DshRateCard = keyof typeof references;

type TokenBuckets = Pick<
  UsageTotals,
  | "inputTokens"
  | "cacheReadTokens"
  | "cacheCreationTokens"
  | "outputTokens"
  | "totalTokens"
>;

function opus55ReferenceCostUSD(
  model: string,
  usage: TokenBuckets,
): number | null {
  const name = model.trim().toLowerCase();
  if (name !== "claude-opus-5-5" && name !== "anthropic/claude-opus-5-5")
    return null;

  // USD / million tokens: $4 input, $0.20 hit, $5 default write, $20 output.
  const nanoUSD =
    usage.inputTokens * 4_000 +
    usage.cacheReadTokens * 200 +
    usage.cacheCreationTokens * 5_000 +
    usage.outputTokens * 20_000;
  return Number.isSafeInteger(nanoUSD) ? nanoUSD / 1_000_000_000 : null;
}

/** Price one DSH request under the provider's published default API terms. */
export function estimateDshRequest(
  model: string,
  usage: TokenBuckets,
  at: Date,
): { costUSD: number; card: DshRateCard } | null {
  const {
    inputTokens,
    cacheReadTokens,
    cacheCreationTokens,
    outputTokens,
    totalTokens,
  } = usage;
  if (
    ![
      inputTokens,
      cacheReadTokens,
      cacheCreationTokens,
      outputTokens,
      totalTokens,
    ].every((count) => Number.isSafeInteger(count) && count >= 0) ||
    inputTokens + cacheReadTokens + cacheCreationTokens + outputTokens !==
      totalTokens ||
    !Number.isFinite(at.getTime())
  )
    return null;
  const deepseekCost = deepseekReferenceCostUSD(model, usage, at);
  if (deepseekCost !== null) return { costUSD: deepseekCost, card: "deepseek" };
  const astraCost = astraReferenceCostUSD(model, usage);
  if (astraCost !== null) return { costUSD: astraCost, card: "astra" };
  const opusCost = opus55ReferenceCostUSD(model, usage);
  return opusCost !== null ? { costUSD: opusCost, card: "opus55" } : null;
}

export function dshPricingMetadata(
  snapshot: Pick<UsageSnapshot, "activeDeviceIds" | "sessions">,
) {
  const used = new Set<DshRateCard>();
  if (snapshot.activeDeviceIds.includes("local")) {
    for (const session of snapshot.sessions) {
      if (session.source === "dsh")
        for (const card of session.dshRateCards ?? []) used.add(card);
    }
  }
  return {
    dshPricing: used.has("deepseek") ? references.deepseek : undefined,
    dshAstraPricing: used.has("astra") ? references.astra : undefined,
    dshOpusPricing: used.has("opus55") ? references.opus55 : undefined,
  };
}
