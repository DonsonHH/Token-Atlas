"use client"

import { useMemo, useState } from "react"
import { Cell, Pie, PieChart } from "recharts"

import { Button } from "@/components/ui/button"
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { formatTokens } from "@/lib/format"
import { aggregateModelColor, getModelColor } from "@/lib/model-colors"
import type { UsageModel } from "@/lib/usage"

type DistributionMetric = "cacheRead" | "inputOutput" | "tokens"

type DistributionRow = {
  cacheReadTokens: number
  inputOutputTokens: number
  isAggregate?: boolean
  modelCount: number
  name: string
  totalTokens: number
}

const distributionConfig = {
  value: {
    label: "模型分布",
  },
} satisfies ChartConfig

const metricLabel: Record<DistributionMetric, string> = {
  cacheRead: "缓存读取",
  inputOutput: "请求 token",
  tokens: "总 token",
}

function metricValue(row: DistributionRow, metric: DistributionMetric) {
  if (metric === "cacheRead") return row.cacheReadTokens
  if (metric === "inputOutput") return row.inputOutputTokens
  return row.totalTokens
}

function formatMetric(value: number) {
  return formatTokens(value)
}

function rowsFromModels(models: UsageModel[], metric: DistributionMetric) {
  const rows: DistributionRow[] = models
    .map((model) => ({
      cacheReadTokens: model.cacheReadTokens,
      inputOutputTokens: model.inputTokens + model.outputTokens,
      modelCount: 1,
      name: model.name,
      totalTokens: model.totalTokens,
    }))
    .sort((left, right) => metricValue(right, metric) - metricValue(left, metric))

  if (rows.length <= 5) return rows

  const remaining = rows.slice(4)
  const other: DistributionRow = {
    cacheReadTokens: remaining.reduce((sum, row) => sum + row.cacheReadTokens, 0),
    inputOutputTokens: remaining.reduce((sum, row) => sum + row.inputOutputTokens, 0),
    isAggregate: true,
    modelCount: remaining.length,
    name: `其他 ${remaining.length} 个模型`,
    totalTokens: remaining.reduce((sum, row) => sum + row.totalTokens, 0),
  }

  return [...rows.slice(0, 4), other]
}

function DistributionMetricToggle({
  onValueChange,
  value,
}: {
  onValueChange: (value: DistributionMetric) => void
  value: DistributionMetric
}) {
  return (
    <div aria-label="选择模型分布口径" className="inline-flex items-center rounded-lg border bg-muted/35 p-1" role="group">
      <Button
        aria-pressed={value === "tokens"}
        className="h-7 px-2.5 text-xs"
        onClick={() => onValueChange("tokens")}
        size="sm"
        variant={value === "tokens" ? "secondary" : "ghost"}
      >
        总量
      </Button>
      <Button
        aria-pressed={value === "inputOutput"}
        className="h-7 px-2.5 text-xs"
        onClick={() => onValueChange("inputOutput")}
        size="sm"
        variant={value === "inputOutput" ? "secondary" : "ghost"}
      >
        请求
      </Button>
      <Button
        aria-pressed={value === "cacheRead"}
        className="h-7 px-2.5 text-xs"
        onClick={() => onValueChange("cacheRead")}
        size="sm"
        variant={value === "cacheRead" ? "secondary" : "ghost"}
      >
        缓存
      </Button>
    </div>
  )
}

function ModelDistribution({ models }: { models: UsageModel[] }) {
  const [selectedMetric, setSelectedMetric] = useState<DistributionMetric>("tokens")
  const metric = selectedMetric
  const rows = useMemo(() => rowsFromModels(models, metric), [metric, models])
  const metricColumns = useMemo(() => {
    const all: DistributionMetric[] = ["tokens", "inputOutput", "cacheRead"]
    return [metric, ...all.filter((value) => value !== metric)]
  }, [metric])
  const total = rows.reduce((sum, row) => sum + metricValue(row, metric), 0)
  const topTwoShare = total
    ? (rows.slice(0, 2).reduce((sum, row) => sum + metricValue(row, metric), 0) / total) * 100
    : 0
  const chartRows = rows.map((row) => ({
    ...row,
    color: row.isAggregate ? aggregateModelColor : getModelColor(row.name),
    share: total ? (metricValue(row, metric) / total) * 100 : 0,
    value: metricValue(row, metric),
  }))

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b pb-4">
        <div>
          <p className="text-sm font-medium">分布口径</p>
          <p className="mt-1 text-xs text-muted-foreground">
            按{metricLabel[metric]}排序与计算占比；表格第一列与图表口径同步。
          </p>
        </div>
        <DistributionMetricToggle onValueChange={setSelectedMetric} value={metric} />
      </div>

      <div className="grid gap-5 lg:grid-cols-[minmax(12rem,0.62fr)_minmax(0,1fr)] lg:items-center">
        <div className="relative mx-auto h-56 w-56 sm:h-60 sm:w-60">
          <ChartContainer className="size-full aspect-auto" config={distributionConfig}>
            <PieChart accessibilityLayer>
              <ChartTooltip
                content={<ChartTooltipContent hideLabel formatter={(value) => formatMetric(Number(value))} nameKey="name" />}
              />
              <Pie
                cx="50%"
                cy="50%"
                data={chartRows}
                dataKey="value"
                innerRadius={58}
                nameKey="name"
                outerRadius={88}
                paddingAngle={2}
                stroke="var(--card)"
                strokeWidth={2}
              >
                {chartRows.map((row) => <Cell fill={row.color} key={row.name} />)}
              </Pie>
            </PieChart>
          </ChartContainer>
          <div className="pointer-events-none absolute inset-0 grid place-items-center text-center">
            <div className="flex w-full flex-col items-center">
            <span className="w-full text-center text-xs text-muted-foreground">{metricLabel[metric]}</span>
            <strong className="mt-1 w-full text-center text-xl font-semibold tabular-nums">{formatMetric(total)}</strong>
            <span className="mt-1 w-full text-center text-xs text-muted-foreground">{models.length} 个模型</span>
            </div>
          </div>
        </div>

        <div className="min-w-0">
          <div className="hidden overflow-hidden rounded-xl border md:block">
            <Table>
              <TableHeader className="bg-muted/[0.16]">
                <TableRow>
                  <TableHead>模型</TableHead>
                  <TableHead className="text-right">占比</TableHead>
                  {metricColumns.map((column) => (
                    <TableHead
                      className={`text-right ${column === metric ? "bg-muted/40 text-foreground" : ""}`}
                      key={column}
                    >
                      {metricLabel[column]}
                    </TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {chartRows.map((row) => (
                  <TableRow key={row.name}>
                    <TableCell className="max-w-44 py-2.5 font-medium">
                      <span className="flex min-w-0 items-center gap-2">
                        <span className="size-2 shrink-0 rounded-full" style={{ backgroundColor: row.color }} />
                        <span className="truncate" title={row.name}>{row.name}</span>
                      </span>
                    </TableCell>
                    <TableCell className="py-2.5 text-right text-xs tabular-nums text-muted-foreground">{row.share.toFixed(1)}%</TableCell>
                    {metricColumns.map((column) => (
                      <TableCell
                        className={`py-2.5 text-right text-xs tabular-nums ${column === metric ? "bg-muted/25 font-medium text-foreground" : "text-muted-foreground"}`}
                        key={column}
                      >
                        {formatTokens(metricValue(row, column))}
                      </TableCell>
                    ))}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          <div className="space-y-3 md:hidden">
            {chartRows.map((row) => (
              <div className="rounded-xl bg-muted/[0.16] p-3" key={row.name}>
                <div className="flex items-center justify-between gap-3">
                  <p className="flex min-w-0 items-center gap-2 font-medium">
                    <span className="size-2 shrink-0 rounded-full" style={{ backgroundColor: row.color }} />
                    <span className="truncate">{row.name}</span>
                  </p>
                  <span className="shrink-0 text-xs tabular-nums text-muted-foreground">{row.share.toFixed(1)}%</span>
                </div>
                <div className="mt-2 grid grid-cols-2 gap-3 text-xs">
                  <span className="text-muted-foreground">Token <strong className="ml-1 font-medium text-foreground tabular-nums">{formatTokens(row.totalTokens)}</strong></span>
                  <span className="text-right text-muted-foreground">占比 <strong className="ml-1 font-medium text-foreground tabular-nums">{row.share.toFixed(1)}%</strong></span>
                  <span className="text-muted-foreground">请求 <strong className="ml-1 font-medium text-foreground tabular-nums">{formatTokens(row.inputOutputTokens)}</strong></span>
                  <span className="text-right text-muted-foreground">缓存 <strong className="ml-1 font-medium text-foreground tabular-nums">{formatTokens(row.cacheReadTokens)}</strong></span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="flex items-center justify-between gap-4 rounded-xl bg-muted/[0.16] px-3.5 py-3 text-sm">
        <div>
          <p className="text-xs text-muted-foreground">模型集中度</p>
          <p className="mt-1 font-semibold tabular-nums">Top 2 占 {topTwoShare.toFixed(1)}%</p>
        </div>
        <div className="border-l pl-4 text-right">
          <p className="text-xs text-muted-foreground">已识别模型</p>
          <p className="mt-1 font-semibold tabular-nums">{models.length} 个</p>
        </div>
      </div>
    </div>
  )
}

export { ModelDistribution }
