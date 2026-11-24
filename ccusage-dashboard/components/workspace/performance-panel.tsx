"use client";

import { useState } from "react";
import { Gauge, Info } from "lucide-react";
import { DashboardPanel } from "@/components/dashboard-panel";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch, SwitchThumb } from "@/components/ui/switch";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { PerformanceState } from "@/hooks/use-performance-report";
import { formatExactTokens } from "@/lib/format";
import { outputSpeed, type PerformanceReport } from "@/lib/performance-types";
import { cn } from "@/lib/utils";
import { Choice, Empty } from "./controls";
import { TimingValue } from "./timing-values";

const numeric = "text-right tabular-nums";
type PerformanceDetail = "models" | "samples";

function TimingMethod({
  partial,
  sampleCounts,
}: {
  partial: boolean;
  sampleCounts?: { checked: boolean; onChange: (checked: boolean) => void };
}) {
  return (
    <Popover>
      <PopoverTrigger
        render={<Button variant="ghost" size="icon-lg" aria-label="计时说明" />}
      >
        <Info className="size-4 text-muted-foreground" aria-hidden="true" />
      </PopoverTrigger>
      <PopoverContent
        align="end"
        aria-label="计时说明"
        className="w-[min(20rem,calc(100vw-2rem))] space-y-2 p-4 text-sm motion-reduce:animate-none"
      >
        <p className="font-medium">计时说明</p>
        <p className="text-xs leading-relaxed text-muted-foreground">
          ≈
          表示日志估算。速度包含等待；首字是首个模型输出，可能来自思考或工具调用。
        </p>
        {partial ? (
          <p className="text-xs leading-relaxed text-muted-foreground">
            当前只覆盖部分记录。缩小日期范围可查看更有针对性的样本。
          </p>
        ) : null}
        {sampleCounts ? (
          <div className="flex items-center justify-between gap-3 border-t pt-3 text-xs">
            <span>显示样本数</span>
            <Switch
              aria-label="显示样本数"
              checked={sampleCounts.checked}
              onCheckedChange={sampleCounts.onChange}
            >
              <SwitchThumb className="motion-reduce:transition-none" />
            </Switch>
          </div>
        ) : null}
      </PopoverContent>
    </Popover>
  );
}

function ModelTimingTable({
  models,
  showSamples,
}: Pick<PerformanceReport, "models"> & { showSamples: boolean }) {
  return (
    <Table aria-label="按模型统计请求性能">
      <TableHeader className="bg-muted/40">
        <TableRow>
          <TableHead className="px-3">模型</TableHead>
          <TableHead className={cn("hidden sm:table-cell", numeric)}>
            请求
          </TableHead>
          <TableHead className={numeric}>输出速度</TableHead>
          <TableHead className={cn("pr-3", numeric)}>首字中位数</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {models.map(({ model, requests, speed, firstToken }) => (
          <TableRow key={model} className="h-13">
            <TableCell className="px-3">
              <p
                className="max-w-[32vw] truncate font-medium sm:max-w-60"
                title={model}
              >
                {model}
              </p>
            </TableCell>
            <TableCell className={cn("hidden sm:table-cell", numeric)}>
              {formatExactTokens(requests)}
            </TableCell>
            <TableCell className={numeric}>
              <TimingValue
                metric={speed}
                unit="tok/s"
                showSamples={showSamples}
              />
            </TableCell>
            <TableCell className={cn("pr-3", numeric)}>
              <TimingValue
                metric={firstToken}
                unit="s"
                showSamples={showSamples}
              />
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

function SampleTimingTable({
  recent,
  timezone,
}: Pick<PerformanceReport, "recent"> & { timezone: string }) {
  const time = new Intl.DateTimeFormat("zh-CN", {
    timeZone: timezone,
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });

  return (
    <Table aria-label="近期请求计时样本">
      <TableHeader className="bg-muted/40">
        <TableRow>
          <TableHead className="hidden px-3 sm:table-cell">完成时间</TableHead>
          <TableHead className="px-3">模型</TableHead>
          <TableHead className={cn("hidden md:table-cell", numeric)}>
            输出
          </TableHead>
          <TableHead className={cn("hidden lg:table-cell", numeric)}>
            总耗时
          </TableHead>
          <TableHead className={numeric}>速度</TableHead>
          <TableHead className={cn("pr-3", numeric)}>首字</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {recent.map((row, index) => (
          <TableRow key={`${row.at}:${row.model}:${index}`} className="h-13">
            <TableCell className="hidden px-3 tabular-nums sm:table-cell">
              {time.format(row.at)}
            </TableCell>
            <TableCell className="px-3">
              <p
                className="max-w-[32vw] truncate font-medium sm:max-w-56"
                title={row.model}
              >
                {row.model}
              </p>
              <p className="text-xs text-muted-foreground sm:hidden">
                {time.format(row.at)}
              </p>
            </TableCell>
            <TableCell className={cn("hidden md:table-cell", numeric)}>
              {formatExactTokens(row.outputTokens)}
            </TableCell>
            <TableCell className={cn("hidden lg:table-cell", numeric)}>
              <TimingValue metric={row.durationMs} unit="s" />
            </TableCell>
            <TableCell className={numeric}>
              <TimingValue metric={outputSpeed(row)} unit="tok/s" />
            </TableCell>
            <TableCell className={cn("pr-3", numeric)}>
              <TimingValue metric={row.firstTokenMs} unit="s" />
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

export function PerformancePanel({
  state,
  timezone,
}: {
  state: PerformanceState;
  timezone: string;
}) {
  const [detail, setDetail] = useState<PerformanceDetail>("models");
  const [showSamples, setShowSamples] = useState(false);
  const { report, reading, unavailable, error } = state;
  const partial =
    report?.coverage.some(
      ({ pending, skipped, limited }) =>
        pending > 0 || skipped > 0 || limited > 0,
    ) ?? false;
  const hasModels = Boolean(report?.models.length);
  const emptyTitle =
    unavailable ?? (error ? "暂时无法读取计时" : "这个范围没有计时样本");

  return (
    <DashboardPanel
      title="Codex 请求性能"
      icon={<Gauge className="size-4" />}
      tone="violet"
      action={
        <div className="flex flex-wrap items-center gap-2">
          {partial ? <Badge variant="outline">部分覆盖</Badge> : null}
          {hasModels ? (
            <Choice
              label="请求性能明细"
              value={detail}
              onChange={setDetail}
              className="h-9 w-32"
              options={[
                { value: "models", label: "按模型" },
                { value: "samples", label: "近期样本" },
              ]}
            />
          ) : null}
          {!unavailable ? (
            <TimingMethod
              partial={partial}
              sampleCounts={
                hasModels && detail === "models"
                  ? { checked: showSamples, onChange: setShowSamples }
                  : undefined
              }
            />
          ) : null}
        </div>
      }
    >
      {report && error ? (
        <p role="status" className="mb-3 text-sm text-muted-foreground">
          计时暂未更新，显示上次结果。
        </p>
      ) : null}
      {report && hasModels ? (
        detail === "samples" && !report.recent.length ? (
          <Empty title="暂无近期计时样本" />
        ) : (
          <div className="rounded-lg border">
            {detail === "models" ? (
              <ModelTimingTable
                models={report.models}
                showSamples={showSamples}
              />
            ) : (
              <SampleTimingTable recent={report.recent} timezone={timezone} />
            )}
          </div>
        )
      ) : reading && !unavailable && !report ? (
        <div role="status" className="space-y-3 rounded-lg border p-4">
          <span className="sr-only">正在读取请求性能</span>
          <Skeleton className="h-9 w-full" />
          <Skeleton className="h-9 w-full" />
          <Skeleton className="h-9 w-full" />
        </div>
      ) : (
        <Empty
          title={emptyTitle}
          detail={unavailable ? undefined : (error ?? "试试调整日期。")}
        />
      )}
    </DashboardPanel>
  );
}
