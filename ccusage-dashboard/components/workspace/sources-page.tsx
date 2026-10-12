"use client";

import { useState } from "react";
import { ArrowUpRight, FileJson, Laptop, Server, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { DashboardPanel } from "@/components/dashboard-panel";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import {
  usageSourceLabel,
  type UsageDevice,
  type UsageSnapshot,
} from "@/lib/usage-types";
import { formatDate, formatTokens } from "@/lib/format";
import { ImportSheet } from "./import-sheet";

export function SourcesPage({
  snapshot,
  onAnalyzeDevice,
  onRefresh,
}: {
  snapshot: UsageSnapshot;
  onAnalyzeDevice: (device: UsageDevice) => void;
  onRefresh: () => Promise<void>;
}) {
  const [importTarget, setImportTarget] = useState<string | null>(null);
  const [audit, setAudit] = useState(false);
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          {snapshot.devices.length} 台设备 · 数据保存在本机
        </p>
        <Button
          className="h-10 gap-2 px-4"
          onClick={() => setImportTarget("new")}
        >
          <Upload className="size-4" />
          导入数据
        </Button>
      </div>
      <section className="grid gap-4 lg:grid-cols-2">
        {snapshot.devices.map((device) => {
          const active = snapshot.activeDeviceIds.includes(device.id);
          const Icon = device.kind === "local" ? Laptop : Server;
          return (
            <article
              key={device.id}
              className="flex min-w-0 flex-col rounded-2xl border bg-card p-5"
            >
              <div className="flex items-start gap-3">
                <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-muted">
                  <Icon className="size-5 text-muted-foreground" />
                </span>
                <div className="min-w-0 flex-1">
                  <h3
                    className="truncate text-sm font-semibold"
                    title={device.name}
                  >
                    {device.name}
                  </h3>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {device.kind === "local" ? "本机日志" : "手动导入"} ·{" "}
                    {usageSourceLabel(device.source)}
                    {device.kind === "imported" && device.readerVersion
                      ? ` · ccusage ${device.readerVersion}`
                      : ""}
                  </p>
                </div>
                <Badge variant="outline" className="shrink-0">
                  {device.status === "error"
                    ? "读取失败"
                    : device.status === "idle"
                      ? "未读取"
                      : active
                        ? device.rangeDays
                          ? "参与统计"
                          : "范围内无记录"
                        : "未选中"}
                </Badge>
              </div>
              <dl className="my-5 grid grid-cols-2 gap-x-4 gap-y-4 text-xs">
                <div>
                  <dt className="text-muted-foreground">最近记录</dt>
                  <dd className="mt-1.5 font-medium tabular-nums">
                    {device.latestDate ?? "—"}
                  </dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">
                    {device.kind === "local"
                      ? "最近读取"
                      : device.exportedAt
                        ? "导出时间"
                        : "导入时间"}
                  </dt>
                  <dd className="mt-1.5 font-medium">
                    {device.updatedAt ? formatDate(device.updatedAt) : "—"}
                  </dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">
                    {snapshot.range.allTime ? "全部历史" : "所选日期内"}
                  </dt>
                  <dd className="mt-1.5 font-medium tabular-nums">
                    {device.status === "idle"
                      ? "未读取"
                      : device.status === "error"
                        ? "读取失败"
                        : !device.rangeDays
                          ? "无记录"
                          : `${formatTokens(device.rangeTokens ?? 0)} token`}
                  </dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">数据粒度</dt>
                  <dd className="mt-1.5 font-medium">
                    {device.kind === "local" ? "每日汇总 + 会话" : "每日汇总"}
                  </dd>
                </div>
              </dl>
              <div className="mt-auto flex justify-between gap-2 border-t pt-4">
                <Button
                  variant="ghost"
                  className="h-9 gap-2 text-xs"
                  onClick={() => onAnalyzeDevice(device)}
                >
                  查看用量
                  <ArrowUpRight className="size-3.5" />
                </Button>
                {device.kind === "imported" ? (
                  <Button
                    variant="outline"
                    className="h-9 gap-2 text-xs"
                    onClick={() => setImportTarget(device.id)}
                  >
                    <Upload className="size-3.5" />
                    更新数据
                  </Button>
                ) : null}
              </div>
            </article>
          );
        })}
      </section>
      <DashboardPanel
        title="数据详情"
        action={
          <Button
            variant="ghost"
            className="h-9 gap-2 text-xs"
            onClick={() => setAudit(true)}
          >
            <FileJson className="size-3.5" />
            查看 JSON
          </Button>
        }
      >
        <div className="grid gap-4 text-xs sm:grid-cols-3">
          <div>
            <p className="text-muted-foreground">当前分析日期</p>
            <p className="mt-2 font-medium tabular-nums">
              {snapshot.range.start} — {snapshot.range.end}
            </p>
          </div>
          <div>
            <p className="text-muted-foreground">统计时区</p>
            <p className="mt-2 font-medium">{snapshot.range.timezone}</p>
          </div>
          <div>
            <p className="text-muted-foreground">本机读取器</p>
            <p className="mt-2 font-medium">
              ccusage {snapshot.readerVersion ?? "版本未知"} · 离线价格表
            </p>
            <p className="mt-1 text-muted-foreground">
              外部参考价保留导出时口径
            </p>
          </div>
        </div>
      </DashboardPanel>
      {importTarget ? (
        <ImportSheet
          devices={snapshot.devices}
          initialDevice={importTarget === "new" ? undefined : importTarget}
          onClose={() => setImportTarget(null)}
          onImported={onRefresh}
        />
      ) : null}
      <Sheet open={audit} onOpenChange={setAudit}>
        <SheetContent className="w-[min(100vw,48rem)] gap-0 sm:max-w-none">
          <SheetHeader className="border-b p-6 pr-14">
            <SheetTitle>当前范围 JSON</SheetTitle>
            <SheetDescription>已归一化的汇总与会话字段。</SheetDescription>
          </SheetHeader>
          <pre className="min-h-0 flex-1 overflow-auto p-5 font-mono text-xs leading-5">
            {JSON.stringify(snapshot.raw, null, 2)}
          </pre>
        </SheetContent>
      </Sheet>
    </div>
  );
}
