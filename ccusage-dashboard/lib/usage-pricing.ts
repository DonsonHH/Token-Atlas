import { formatCost } from "./format";
import type { UsageSession, UsageSource, UsageTotals } from "./usage-types";

/** Match the pinned native reader's bounded model-key and separator lookup. */
export function hasPricingKey(name: string, key: string): boolean {
  const value = name.replace(/[.@]/g, "-");
  const candidate = key.replace(/[.@]/g, "-");
  if (!candidate) return false;
  for (
    let index = value.indexOf(candidate);
    index >= 0;
    index = value.indexOf(candidate, index + candidate.length)
  ) {
    const suffix = value.slice(index + candidate.length);
    if (
      !/[a-z0-9]/i.test(value[index - 1] ?? "") &&
      !/^[a-z0-9]/i.test(suffix) &&
      !(
        /\d$/.test(candidate) &&
        /^-\d/.test(suffix) &&
        !/^-\d{8}(?![a-z0-9])/i.test(suffix)
      )
    )
      return true;
  }
  return false;
}

export function hasPricedCodexModel(
  session: UsageSession,
  source: UsageSource,
  model: string,
): boolean {
  return (
    (session.source ?? source) === "codex" &&
    session.costUSD > 0 &&
    session.models.some(
      (name) =>
        hasPricingKey(name, model) && !session.unpricedModels?.includes(name),
    )
  );
}

/** Costs are known subtotals when any contributing entry has no price. */
export function pricingState(
  totals: UsageTotals,
): "complete" | "partial" | "unavailable" {
  if (totals.pricingUnknown || totals.unpricedModels?.length) {
    return totals.costUSD > 0 ? "partial" : "unavailable";
  }
  return "complete";
}

export function referenceCostLabel(totals: UsageTotals): string {
  const state = pricingState(totals);
  return state === "unavailable"
    ? "待定价"
    : `${state === "partial" ? "≥ " : ""}${formatCost(totals.costUSD)}`;
}

export function pricingWarnings(totals: UsageTotals): string[] {
  const warnings: string[] = [];
  if (totals.unpricedModels?.length) {
    warnings.push(
      `缺少模型价格：${totals.unpricedModels.join("、")}。参考价只包含已定价用量；未知模型、无法确认的计费时段或价格口径保留为待定价。`,
    );
  }
  if (totals.pricingUnknown) {
    warnings.push(
      "部分用量的参考价未确认。旧版或导入报告可能缺少价格，请在原设备更新 ccusage 后重新导出。",
    );
  }
  return warnings;
}
