import type { UsageSnapshot, UsageTotals } from "./usage-types";

export const astraPricingReference = {
  id: "openai-astra-standard-usd-2026-11-15",
  source: "https://developers.openai.com/api/docs/models/gpt-6-astra",
  checkedAt: "2026-11-15",
  currency: "USD",
  serviceTier: "standard",
  cacheWriteTtl: "30m",
  basis:
    "DSH 缺少费用时按 OpenAI Standard 档和默认 30 分钟缓存写入价估算；非网关账单。",
} as const;

function isAstra(model: string) {
  const name = model.trim().toLowerCase();
  return name === "gpt-6-astra" || name === "openai/gpt-6-astra";
}

type RequestTokens = Pick<
  UsageTotals,
  | "inputTokens"
  | "cacheReadTokens"
  | "cacheCreationTokens"
  | "outputTokens"
  | "totalTokens"
>;

/** Estimate one DSH request using disjoint token buckets and the official Standard card. */
export function astraReferenceCostUSD(
  model: string,
  usage: RequestTokens,
): number | null {
  if (!isAstra(model)) return null;
  const {
    inputTokens,
    cacheReadTokens,
    cacheCreationTokens,
    outputTokens,
    totalTokens,
  } = usage;
  const promptTokens = inputTokens + cacheReadTokens + cacheCreationTokens;
  if (
    ![
      inputTokens,
      cacheReadTokens,
      cacheCreationTokens,
      outputTokens,
      totalTokens,
    ].every((tokens) => Number.isSafeInteger(tokens) && tokens >= 0) ||
    promptTokens + outputTokens !== totalTokens
  )
    return null;

  // Nano-USD per token. Long-context rates apply to the whole request.
  const long = promptTokens > 272_000;
  const nanoUSD =
    inputTokens * (long ? 20_000 : 10_000) +
    cacheReadTokens * (long ? 2_000 : 1_000) +
    cacheCreationTokens * (long ? 25_000 : 12_500) +
    outputTokens * (long ? 75_000 : 50_000);
  return Number.isSafeInteger(nanoUSD) ? nanoUSD / 1_000_000_000 : null;
}

export function dshAstraPricingMetadata(
  snapshot: Pick<UsageSnapshot, "activeDeviceIds" | "sessions">,
) {
  if (
    snapshot.activeDeviceIds.includes("local") &&
    snapshot.sessions.some(
      ({ source, hasAstraEstimate }) =>
        source === "dsh" && hasAstraEstimate === true,
    )
  )
    return astraPricingReference;
}
