"use client";

import { useState, type CSSProperties } from "react";
import {
  Activity,
  ArrowRight,
  ArrowUpDown,
  CircleDollarSign,
  Database,
  Info,
  Zap,
} from "lucide-react";
import { DashboardPanel } from "@/components/dashboard-panel";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { formatExactTokens, formatShortDate, formatTokens } from "@/lib/format";
import { calendarPeriods } from "@/lib/usage-analytics";
import type { UsageSnapshot } from "@/lib/usage-types";
import { pricingState, referenceCostLabel } from "@/lib/usage-pricing";
import { TrendChart } from "./trend-chart";
import { ModelBreakdown } from "./model-breakdown";

function Stat({
  label,
  value,
  detail,
  color,
  icon: Icon,
  hint,
  onClick,
}: {
  label: string;
  value: string;
  detail: string;
  color: string;
  icon: typeof Activity;
  hint: string;
  onClick?: () => void;
}) {
  return (
    <div
      className="stat-card min-w-0 rounded-2xl border p-3.5 sm:p-5"
      style={{ "--stat-color": color } as CSSProperties}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="flex items-center gap-1.5 text-xs font-medium text-foreground/75">
          {label}
          <Tooltip>
            <TooltipTrigger
              aria-label={`${label}说明`}
              className="text-muted-foreground"
            >
              <Info className="size-3.5" />
            </TooltipTrigger>
            <TooltipContent className="max-w-64">{hint}</TooltipContent>
          </Tooltip>
        </span>
        <span className="stat-icon hidden size-8 shrink-0 place-items-center rounded-lg sm:grid">
          <Icon className="size-4" />
        </span>
      </div>
      {onClick ? (
        <button
          className="mt-4 max-w-full rounded-md text-left font-semibold tracking-tight tabular-nums outline-none focus-visible:ring-2 focus-visible:ring-ring"
          style={{ fontSize: "clamp(1rem, 10cqi, 1.75rem)" }}
          onClick={onClick}
          title="切换精确数字与紧凑显示"
          aria-label={`总 token ${value}，点击切换显示格式`}
        >
          {value}
        </button>
      ) : (
        <p className="mt-4 text-2xl font-semibold tracking-tight tabular-nums sm:text-[1.75rem]">
          {value}
        </p>
      )}
      <p className="mt-1.5 text-xs leading-5 text-muted-foreground">{detail}</p>
    </div>
  );
}

export function OverviewPage({
  snapshot,
  onAnalyze,
}: {
  snapshot: UsageSnapshot;
  onAnalyze: () => void;
}) {
  const [exact, setExact] = useState(true);
  const { totals, daily, range } = snapshot;
  const active = daily.filter((day) => day.totalTokens > 0).length;
  const periods = calendarPeriods(daily, range, "daily");
  const peak = daily.reduce<(typeof daily)[number] | null>(
    (best, day) => (!best || day.totalTokens > best.totalTokens ? day : best),
    null,
  );
  return (
    <div className="space-y-6">
      <section
        aria-label="核心用量"
        className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4"
      >
        <Stat
          label="总 token"
          value={
            exact
              ? formatExactTokens(totals.totalTokens)
              : formatTokens(totals.totalTokens)
          }
          color="var(--model-1)"
          icon={Activity}
          detail={`${active} / ${range.days} 个活跃日 · 点击切换单位`}
          hint="当前日期范围内的日志总量。推理 token 已包含在输出中。"
          onClick={() => setExact(!exact)}
        />
        <Stat
          label="输入 / 输出"
          value={formatTokens(totals.inputTokens + totals.outputTokens)}
          color="var(--model-4)"
          icon={Zap}
          detail={`${formatTokens(totals.inputTokens)} 输入 · ${formatTokens(totals.outputTokens)} 输出`}
          hint="不含缓存读取与缓存写入的 token 数。不是请求次数。"
        />
        <Stat
          label="缓存复用"
          value={
            totals.totalTokens
              ? `${((totals.cacheReadTokens / totals.totalTokens) * 100).toFixed(1)}%`
              : "—"
          }
          color="var(--model-3)"
          icon={Database}
          detail={`${formatTokens(totals.cacheReadTokens)} 缓存读取`}
          hint="缓存读取占总 token 的比例，不代表服务商的缓存命中率。"
        />
        <Stat
          label="API 参考价"
          value={referenceCostLabel(totals)}
          color="var(--model-2)"
          icon={CircleDollarSign}
          detail={
            pricingState(totals) === "complete"
              ? "本地估算 · 非实际账单"
              : pricingState(totals) === "partial"
                ? "已定价部分 · 存在价格缺失"
                : "缺少可确认的模型价格"
          }
          hint="使用 ccusage 内置价格估算。缺价时显示待定价或已知小计；不会把未知价格当作免费用量。"
        />
      </section>
      <DashboardPanel
        title="每日用量"
        icon={<Activity className="size-4" />}
        tone="blue"
        action={
          <Button
            variant="ghost"
            className="h-9 gap-2 text-xs"
            onClick={onAnalyze}
          >
            深入分析
            <ArrowRight className="size-3.5" />
          </Button>
        }
      >
        <div className="mb-5 flex flex-wrap items-center gap-x-6 gap-y-2 text-xs text-muted-foreground">
          <span>
            日均{" "}
            <strong className="ml-1 text-foreground tabular-nums">
              {formatTokens(totals.totalTokens / range.days)}
            </strong>
          </span>
          <span>
            峰值{" "}
            <strong className="ml-1 text-foreground tabular-nums">
              {peak ? formatTokens(peak.totalTokens) : "—"}
            </strong>
            {peak ? ` · ${formatShortDate(peak.label)}` : ""}
          </span>
          <span className="ml-auto inline-flex items-center gap-1.5">
            <ArrowUpDown className="size-3" />总 token
          </span>
        </div>
        <TrendChart periods={periods} compact />
      </DashboardPanel>
      <ModelBreakdown snapshot={snapshot} />
    </div>
  );
}
