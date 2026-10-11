"use client";

import { useMemo, useState } from "react";
import { CalendarDays, Download, TrendingUp } from "lucide-react";
import { toast } from "sonner";
import { DashboardPanel } from "@/components/dashboard-panel";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatCost, formatTokens } from "@/lib/format";
import { downloadJsonFile } from "@/lib/download";
import {
  calendarPeriods,
  grains,
  metricValue,
  metrics,
  type Grain,
  type Metric,
} from "@/lib/usage-analytics";
import type { UsageSnapshot } from "@/lib/usage-types";
import type { WorkspaceState } from "@/lib/workspace-state";
import { Choice, Segmented } from "./controls";
import { TrendChart } from "./trend-chart";

export function AnalysisPage({
  snapshot,
  state,
  onChange,
}: {
  snapshot: UsageSnapshot;
  state: WorkspaceState;
  onChange: (patch: Partial<WorkspaceState>) => void;
}) {
  const [tableLimit, setTableLimit] = useState(10);
  const periods = useMemo(
    () => calendarPeriods(snapshot.daily, snapshot.range, state.grain),
    [snapshot.daily, snapshot.range, state.grain],
  );
  const values = periods.map((period) => metricValue(period, state.metric));
  const total = values.reduce((sum, value) => sum + value, 0);
  const peak = periods[values.indexOf(Math.max(...values))];
  const valueLabel = (value: number) =>
    state.metric === "cost" ? formatCost(value) : formatTokens(value);
  const split = state.metric !== "cost" && state.split;
  const details = periods.slice().reverse();
  function exportPeriods() {
    try {
      downloadJsonFile(
        `token-atlas-${state.grain}-${snapshot.range.start}-${snapshot.range.end}.json`,
        {
          range: snapshot.range,
          source: snapshot.source,
          devices: snapshot.activeDeviceIds,
          grain: state.grain,
          periods,
        },
      );
      toast.success("周期明细已下载");
    } catch {
      toast.error("导出失败，请重试");
    }
  }
  return (
    <div className="space-y-6">
      <DashboardPanel
        title="用量趋势"
        icon={<TrendingUp className="size-4" />}
        tone="blue"
      >
        <div className="mb-5 flex flex-wrap items-center gap-3 border-b pb-4">
          <Choice
            label="趋势指标"
            value={state.metric}
            onChange={(metric: Metric) => onChange({ metric })}
            options={Object.entries(metrics).map(([value, item]) => ({
              value: value as Metric,
              label: item.label,
            }))}
            className="w-40"
          />
          <Segmented
            label="统计粒度"
            value={state.grain}
            onChange={(grain: Grain) => onChange({ grain })}
            options={Object.entries(grains).map(([value, label]) => ({
              value: value as Grain,
              label: `按${label}`,
            }))}
          />
          {state.metric !== "cost" ? (
            <div className="sm:ml-auto">
              <Segmented
                label="趋势分组"
                value={split ? "models" : "total"}
                onChange={(value) => onChange({ split: value === "models" })}
                options={[
                  { value: "total", label: "总量" },
                  { value: "models", label: "按模型" },
                ]}
              />
            </div>
          ) : null}
        </div>
        <div className="mb-5 flex flex-wrap items-baseline gap-x-6 gap-y-2">
          <span className="text-3xl font-semibold tracking-tight tabular-nums">
            {valueLabel(total)}
          </span>
          <span className="text-xs text-muted-foreground">
            每{grains[state.grain]}均值{" "}
            <strong className="ml-1 text-foreground tabular-nums">
              {valueLabel(total / Math.max(periods.length, 1))}
            </strong>
          </span>
          <span className="text-xs text-muted-foreground">
            峰值{" "}
            <strong className="ml-1 text-foreground tabular-nums">
              {peak ? valueLabel(metricValue(peak, state.metric)) : "—"}
            </strong>
          </span>
        </div>
        <TrendChart
          periods={periods}
          metric={state.metric}
          split={split}
          average={!split && state.grain === "daily"}
        />
        <p className="mt-4 text-xs text-muted-foreground">
          {split
            ? "按区间用量从少到多堆叠 · 前五模型 + 其他 · 点击图例突出显示"
            : state.grain === "daily"
              ? "无记录日期按 0 展示"
              : "边界周期仅统计所选日期内的用量"}
        </p>
      </DashboardPanel>
      <DashboardPanel
        title="周期明细"
        icon={<CalendarDays className="size-4" />}
        action={
          <Button
            variant="ghost"
            onClick={exportPeriods}
            className="h-9 gap-2 text-xs"
          >
            <Download className="size-3.5" />
            导出明细
          </Button>
        }
      >
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>
                周期{state.grain === "weekly" ? "（周一开始）" : ""}
              </TableHead>
              <TableHead className="text-right">
                {metrics[state.metric].label}
              </TableHead>
              <TableHead className="hidden text-right sm:table-cell">
                缓存占比
              </TableHead>
              <TableHead className="hidden text-right md:table-cell">
                参考价
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {details.slice(0, tableLimit).map((period) => (
              <TableRow key={period.label}>
                <TableCell className="py-3.5 tabular-nums">
                  {period.label}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {valueLabel(metricValue(period, state.metric))}
                </TableCell>
                <TableCell className="hidden text-right tabular-nums text-muted-foreground sm:table-cell">
                  {period.totalTokens
                    ? `${((period.cacheReadTokens / period.totalTokens) * 100).toFixed(1)}%`
                    : "—"}
                </TableCell>
                <TableCell className="hidden text-right tabular-nums text-muted-foreground md:table-cell">
                  {formatCost(period.costUSD)}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        {details.length > 10 ? (
          <Button
            className="mt-3 w-full text-xs"
            variant="ghost"
            onClick={() => setTableLimit(tableLimit === 10 ? 366 : 10)}
          >
            {tableLimit === 10 ? `查看全部 ${details.length} 个周期` : "收起"}
          </Button>
        ) : null}
      </DashboardPanel>
    </div>
  );
}
