import { formatCost } from "./format";
import type { UsageTotals } from "./usage-types";

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
      `缺少模型价格：${totals.unpricedModels.join("、")}。参考价只包含已定价用量；请更新 ccusage 或使用有明确来源的 pricingOverrides。`,
    );
  }
  if (totals.pricingUnknown) {
    warnings.push(
      "部分用量的参考价未确认。旧版或导入报告可能缺少价格，请在原设备更新 ccusage 后重新导出。",
    );
  }
  return warnings;
}
