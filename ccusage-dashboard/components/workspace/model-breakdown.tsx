"use client";

import { useMemo, useState } from "react";
import { Cell, Pie, PieChart } from "recharts";
import { Layers3 } from "lucide-react";
import { DashboardPanel } from "@/components/dashboard-panel";
import { ChartContainer, ChartTooltip } from "@/components/ui/chart";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatExactTokens, formatTokens } from "@/lib/format";
import { assignModelColors } from "@/lib/model-colors";
import {
  metricValue,
  metrics,
  modelSeries,
  type Metric,
} from "@/lib/usage-analytics";
import type { UsageSnapshot } from "@/lib/usage-types";
import { Choice, Empty } from "./controls";

export function ModelBreakdown({ snapshot }: { snapshot: UsageSnapshot }) {
  const [metric, setMetric] = useState<Exclude<Metric, "cost">>("tokens");
  const [expanded, setExpanded] = useState(false);
  const colors = useMemo(
    () => assignModelColors(snapshot.models.map((model) => model.name)),
    [snapshot.models],
  );
  const slices = useMemo(
    () => modelSeries(snapshot.daily, metric).slice().reverse(),
    [snapshot.daily, metric],
  );
  const total = metricValue(snapshot.totals, metric);
  const rows = useMemo(
    () =>
      snapshot.models
        .slice()
        .sort((a, b) => metricValue(b, metric) - metricValue(a, metric)),
    [snapshot.models, metric],
  );
  const visible = expanded ? rows : rows.slice(0, 6);
  return (
    <DashboardPanel
      title="模型分布"
      icon={<Layers3 className="size-4" />}
      tone="violet"
      action={
        <Choice
          label="模型分布指标"
          value={metric}
          onChange={setMetric}
          options={[
            { value: "tokens", label: "按总 token" },
            { value: "inputOutput", label: "按输入 / 输出" },
            { value: "cacheRead", label: "按缓存读取" },
          ]}
          className="h-9 text-xs"
        />
      }
    >
      {total ? (
        <div className="grid items-start gap-6 lg:grid-cols-[15rem_minmax(0,1fr)]">
          <div className="py-2 text-center">
            <div className="relative mx-auto size-56">
              <ChartContainer
                config={{ total: { label: metrics[metric].label } }}
                className="size-full aspect-auto"
              >
                <PieChart>
                  <Pie
                    data={slices}
                    dataKey="total"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    innerRadius={70}
                    outerRadius={98}
                    paddingAngle={slices.length > 1 ? 1.5 : 0}
                    stroke="var(--card)"
                    strokeWidth={3}
                    isAnimationActive={false}
                  >
                    {slices.map((item) => (
                      <Cell key={item.key} fill={item.color} />
                    ))}
                  </Pie>
                  <ChartTooltip
                    content={({ active, payload }) =>
                      active && payload?.length ? (
                        <div className="rounded-lg border bg-popover px-3 py-2 text-xs shadow-lg">
                          <p>{payload[0].name}</p>
                          <p className="mt-1 font-semibold tabular-nums">
                            {formatExactTokens(Number(payload[0].value))}
                          </p>
                        </div>
                      ) : null
                    }
                  />
                </PieChart>
              </ChartContainer>
              <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-1">
                <span className="text-xs text-muted-foreground">
                  {metrics[metric].label}
                </span>
                <strong className="text-2xl font-semibold tabular-nums">
                  {formatTokens(total)}
                </strong>
                <span className="text-xs text-muted-foreground">
                  {rows.length} 个模型
                </span>
              </div>
            </div>
            {slices.some((item) => item.key === "others" || item.residual) ? (
              <p className="mt-1 text-xs text-muted-foreground">
                环图保留其他模型与未归类用量
              </p>
            ) : null}
          </div>
          <div className="min-w-0">
            <div className="hidden md:block">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>模型</TableHead>
                    <TableHead className="text-right">
                      {metrics[metric].label}
                    </TableHead>
                    <TableHead className="text-right">占比</TableHead>
                    <TableHead className="text-right">缓存占比</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {visible.map((model) => (
                    <TableRow key={model.name}>
                      <TableCell className="max-w-60 py-3.5">
                        <span className="flex min-w-0 items-center gap-2">
                          <i
                            className="size-2 shrink-0 rounded-full"
                            style={{ background: colors[model.name] }}
                          />
                          <span
                            className="truncate font-medium"
                            title={model.name}
                          >
                            {model.name}
                          </span>
                        </span>
                      </TableCell>
                      <TableCell
                        className="text-right tabular-nums"
                        title={formatExactTokens(metricValue(model, metric))}
                      >
                        {formatTokens(metricValue(model, metric))}
                      </TableCell>
                      <TableCell className="text-right tabular-nums text-muted-foreground">
                        {((metricValue(model, metric) / total) * 100).toFixed(
                          1,
                        )}
                        %
                      </TableCell>
                      <TableCell className="text-right tabular-nums text-muted-foreground">
                        {model.totalTokens
                          ? (
                              (model.cacheReadTokens / model.totalTokens) *
                              100
                            ).toFixed(1) + "%"
                          : "—"}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            <div className="divide-y md:hidden">
              {visible.map((model) => (
                <div key={model.name} className="py-3">
                  <div className="flex items-center justify-between gap-3">
                    <span className="flex min-w-0 items-center gap-2 text-sm font-medium">
                      <i
                        className="size-2 shrink-0 rounded-full"
                        style={{ background: colors[model.name] }}
                      />
                      <span className="truncate">{model.name}</span>
                    </span>
                    <span className="shrink-0 text-sm tabular-nums">
                      {formatTokens(metricValue(model, metric))}
                    </span>
                  </div>
                  <div className="mt-2 h-1 overflow-hidden rounded-full bg-muted">
                    <div
                      className="h-full rounded-full"
                      style={{
                        width: `${(metricValue(model, metric) / total) * 100}%`,
                        background: colors[model.name],
                      }}
                    />
                  </div>
                </div>
              ))}
            </div>
            {rows.length > 6 ? (
              <Button
                className="mt-3 w-full text-xs"
                variant="ghost"
                onClick={() => setExpanded(!expanded)}
              >
                {expanded ? "收起" : `查看全部 ${rows.length} 个模型`}
              </Button>
            ) : null}
          </div>
        </div>
      ) : (
        <Empty title="这个指标没有用量" />
      )}
    </DashboardPanel>
  );
}
