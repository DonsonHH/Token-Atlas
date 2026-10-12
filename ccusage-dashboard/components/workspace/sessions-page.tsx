"use client";

import { useMemo, useState } from "react";
import {
  ChevronLeft,
  ChevronRight,
  Copy,
  Download,
  History,
  Search,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { DashboardPanel } from "@/components/dashboard-panel";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  formatDate,
  formatExactTokens,
  formatProject,
  formatTokens,
} from "@/lib/format";
import { downloadJsonFile } from "@/lib/download";
import { referenceCostLabel } from "@/lib/usage-pricing";
import type { UsageSession, UsageSnapshot } from "@/lib/usage-types";
import { Choice, Empty } from "./controls";

function time(value: string | null) {
  const parsed = Date.parse(value ?? "");
  return Number.isFinite(parsed) ? parsed : 0;
}
function sessionLabel(session: UsageSession) {
  return session.project
    ? formatProject(session.project)
    : `会话 · ${session.id.slice(-8)}`;
}

export function SessionsPage({
  snapshot,
  onLocal,
}: {
  snapshot: UsageSnapshot;
  onLocal: () => void;
}) {
  const [query, setQuery] = useState("");
  const [model, setModel] = useState("all");
  const [sort, setSort] = useState("recent");
  const [page, setPage] = useState(0);
  const [selected, setSelected] = useState<UsageSession | null>(null);
  const models = useMemo(
    () => [...new Set(snapshot.sessions.flatMap((item) => item.models))].sort(),
    [snapshot.sessions],
  );
  const rows = useMemo(
    () =>
      snapshot.sessions
        .filter((item) => {
          const matchesModel = model === "all" || item.models.includes(model);
          const matchesQuery = [item.id, item.project ?? "", ...item.models]
            .join(" ")
            .toLowerCase()
            .includes(query.trim().toLowerCase());
          return matchesModel && matchesQuery;
        })
        .slice()
        .sort((a, b) =>
          sort === "tokens"
            ? b.totalTokens - a.totalTokens
            : sort === "cost"
              ? b.costUSD - a.costUSD
              : time(b.lastActivity) - time(a.lastActivity),
        ),
    [snapshot.sessions, model, query, sort],
  );
  const pageCount = Math.max(1, Math.ceil(rows.length / 20));
  const currentPage = Math.min(page, pageCount - 1);
  const visible = rows.slice(currentPage * 20, currentPage * 20 + 20);
  const medianValues = snapshot.sessions
    .map((item) => item.totalTokens)
    .sort((a, b) => a - b);
  const middle = Math.floor(medianValues.length / 2);
  const median = medianValues.length
    ? medianValues.length % 2
      ? medianValues[middle]
      : (medianValues[middle - 1] + medianValues[middle]) / 2
    : 0;
  function exportSessions() {
    try {
      downloadJsonFile(`token-atlas-sessions-${snapshot.range.end}.json`, {
        range: snapshot.range,
        source: snapshot.source,
        model,
        search: query,
        sessions: rows,
      });
      toast.success("筛选后的会话已下载");
    } catch {
      toast.error("导出失败，请重试");
    }
  }
  if (snapshot.sessionStatus !== "ready")
    return (
      <Empty
        title={
          snapshot.sessionStatus === "aggregate-only"
            ? "这台设备只提供每日汇总"
            : "暂时无法读取会话"
        }
        detail="会话记录由本机日志解析。外部 JSON 不包含会话明细。"
        action={
          <Button variant="outline" className="h-10" onClick={onLocal}>
            查看本机会话
          </Button>
        }
      />
    );
  return (
    <div className="space-y-6">
      <p className="flex items-center gap-2 text-xs text-muted-foreground">
        <History className="size-3.5" />
        仅本机 · 日期范围内的会话用量
      </p>
      <div className="grid grid-cols-3 gap-3">
        {[
          ["会话", `${snapshot.sessions.length}`],
          ["会话用量中位数", formatTokens(median)],
          ["最大会话", formatTokens(medianValues.at(-1) ?? 0)],
        ].map(([label, value]) => (
          <div
            key={label}
            className="rounded-xl border bg-card px-3 py-4 sm:px-5"
          >
            <p className="text-[11px] text-muted-foreground sm:text-xs">
              {label}
            </p>
            <p className="mt-2 text-lg font-semibold tabular-nums sm:text-2xl">
              {value}
            </p>
          </div>
        ))}
      </div>
      <DashboardPanel
        title="会话记录"
        action={
          <Button
            disabled={!rows.length}
            onClick={exportSessions}
            variant="ghost"
            className="h-9 gap-2 text-xs"
          >
            <Download className="size-3.5" />
            导出结果
          </Button>
        }
      >
        <div className="mb-5 grid gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(8rem,12rem)_8rem]">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-3 size-4 text-muted-foreground" />
            <Input
              aria-label="搜索会话"
              className="h-10 pl-9 pr-9"
              placeholder="搜索项目、模型或会话 ID"
              value={query}
              onChange={(event) => {
                setQuery(event.target.value);
                setPage(0);
              }}
            />
            {query ? (
              <Button
                aria-label="清空搜索"
                variant="ghost"
                className="absolute right-1 top-1 size-8"
                onClick={() => {
                  setQuery("");
                  setPage(0);
                }}
              >
                <X className="size-3.5" />
              </Button>
            ) : null}
          </div>
          <Choice
            label="会话模型"
            value={model}
            onChange={(value) => {
              setModel(value);
              setPage(0);
            }}
            options={[
              { value: "all", label: "全部模型" },
              ...models.map((name) => ({ value: name, label: name })),
            ]}
            className="w-full"
          />
          <Choice
            label="会话排序"
            value={sort}
            onChange={(value) => {
              setSort(value);
              setPage(0);
            }}
            options={[
              { value: "recent", label: "最近活动" },
              { value: "tokens", label: "用量最高" },
              { value: "cost", label: "参考价最高" },
            ]}
            className="w-full"
          />
        </div>
        {!rows.length ? (
          <Empty
            title="没有匹配的会话"
            action={
              query || model !== "all" ? (
                <Button
                  variant="outline"
                  onClick={() => {
                    setQuery("");
                    setModel("all");
                  }}
                >
                  清除会话筛选
                </Button>
              ) : undefined
            }
          />
        ) : (
          <>
            <div className="hidden md:block">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>会话 / 项目</TableHead>
                    <TableHead>模型</TableHead>
                    <TableHead>最后活动</TableHead>
                    <TableHead className="text-right">总 token</TableHead>
                    <TableHead className="text-right">参考价</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {visible.map((session, index) => (
                    <TableRow key={`${session.id}-${index}`}>
                      <TableCell className="max-w-52 py-3.5">
                        <button
                          className="max-w-full truncate rounded text-left font-medium outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring"
                          onClick={() => setSelected(session)}
                          title={session.id}
                        >
                          {sessionLabel(session)}
                        </button>
                      </TableCell>
                      <TableCell className="max-w-48">
                        <span
                          className="block truncate text-xs text-muted-foreground"
                          title={session.models.join(", ")}
                        >
                          {session.models.join(", ") || "未归类"}
                        </span>
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                        {formatDate(session.lastActivity)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatTokens(session.totalTokens)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums text-muted-foreground">
                        {referenceCostLabel(session)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            <div className="space-y-2 md:hidden">
              {visible.map((session, index) => (
                <button
                  key={`${session.id}-${index}`}
                  onClick={() => setSelected(session)}
                  className="w-full rounded-xl border p-3.5 text-left outline-none hover:bg-muted/40 focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <div className="flex justify-between gap-3">
                    <span className="truncate text-sm font-medium">
                      {sessionLabel(session)}
                    </span>
                    <strong className="shrink-0 text-sm tabular-nums">
                      {formatTokens(session.totalTokens)}
                    </strong>
                  </div>
                  <p className="mt-1.5 truncate text-xs text-muted-foreground">
                    {session.models.join(", ") || "未归类模型"}
                  </p>
                  <p className="mt-2 text-xs text-muted-foreground">
                    {formatDate(session.lastActivity)}
                  </p>
                </button>
              ))}
            </div>
          </>
        )}
        <div className="mt-5 flex items-center justify-between gap-3 border-t pt-4 text-xs text-muted-foreground">
          <span>
            {rows.length} 条记录 · {currentPage + 1} / {pageCount} 页
          </span>
          <div className="flex gap-1">
            <Button
              aria-label="上一页会话"
              variant="outline"
              className="size-9"
              disabled={currentPage === 0}
              onClick={() => setPage(currentPage - 1)}
            >
              <ChevronLeft className="size-4" />
            </Button>
            <Button
              aria-label="下一页会话"
              variant="outline"
              className="size-9"
              disabled={currentPage >= pageCount - 1}
              onClick={() => setPage(currentPage + 1)}
            >
              <ChevronRight className="size-4" />
            </Button>
          </div>
        </div>
      </DashboardPanel>
      <Sheet
        open={Boolean(selected)}
        onOpenChange={(open) => {
          if (!open) setSelected(null);
        }}
      >
        <SheetContent className="w-[min(100vw,32rem)] gap-0 overflow-y-auto sm:max-w-none">
          <SheetHeader className="border-b p-6 pr-14">
            <SheetTitle>会话详情</SheetTitle>
            <SheetDescription>所选日期范围内的用量</SheetDescription>
          </SheetHeader>
          {selected ? (
            <div className="space-y-6 p-6">
              <div className="space-y-2">
                <p className="text-xs text-muted-foreground">会话 ID</p>
                <p className="break-all font-mono text-xs leading-5">
                  {selected.id}
                </p>
                <Button
                  variant="outline"
                  className="h-9 gap-2"
                  onClick={async () => {
                    try {
                      await navigator.clipboard.writeText(selected.id);
                      toast.success("会话 ID 已复制");
                    } catch {
                      toast.error("复制失败，请手动选择 ID");
                    }
                  }}
                >
                  <Copy className="size-3.5" />
                  复制 ID
                </Button>
              </div>
              <dl className="grid grid-cols-2 gap-4">
                {[
                  ["总 token", formatExactTokens(selected.totalTokens)],
                  ["参考价", referenceCostLabel(selected)],
                  ["输入", formatTokens(selected.inputTokens)],
                  ["输出", formatTokens(selected.outputTokens)],
                  ["缓存读取", formatTokens(selected.cacheReadTokens)],
                  ["缓存写入", formatTokens(selected.cacheCreationTokens)],
                ].map(([label, value]) => (
                  <div
                    key={label}
                    className="min-w-0 rounded-xl bg-muted/50 p-3"
                  >
                    <dt className="text-xs text-muted-foreground">{label}</dt>
                    <dd className="mt-1.5 break-all text-sm font-medium tabular-nums">
                      {value}
                    </dd>
                  </div>
                ))}
              </dl>
              <div>
                <p className="text-xs text-muted-foreground">模型</p>
                <p className="mt-2 break-words text-sm">
                  {selected.models.join(" · ") || "未归类"}
                </p>
              </div>
              {selected.project ? (
                <div>
                  <p className="text-xs text-muted-foreground">项目目录</p>
                  <p className="mt-2 break-all font-mono text-xs">
                    {selected.project}
                  </p>
                </div>
              ) : null}
            </div>
          ) : null}
        </SheetContent>
      </Sheet>
    </div>
  );
}
