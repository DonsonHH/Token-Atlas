"use client";

import { useMemo, useRef, useState } from "react";
import { FileJson, Upload } from "lucide-react";
import { toast } from "sonner";
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
  importLimit,
  validateUsageImport,
} from "@/lib/usage-import-validation";
import {
  usageSourceOptions,
  type UsageDevice,
  type UsageSource,
} from "@/lib/usage-types";
import { formatTokens } from "@/lib/format";
import { Choice } from "./controls";

export function ImportSheet({
  devices,
  initialDevice,
  onClose,
  onImported,
}: {
  devices: UsageDevice[];
  initialDevice?: string;
  onClose: () => void;
  onImported: () => Promise<void>;
}) {
  const original = devices.find((device) => device.id === initialDevice);
  const [target, setTarget] = useState(initialDevice ?? "new");
  const [name, setName] = useState(original?.name ?? "");
  const [source, setSource] = useState<UsageSource>(
    original?.source ?? "codex",
  );
  const [content, setContent] = useState("");
  const [busy, setBusy] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const newId = useRef<string | null>(null);
  const targetDevice = devices.find((device) => device.id === target);
  const inspection = useMemo(() => {
    if (!content.trim()) return { report: null, error: "" };
    try {
      if (content.length > importLimit) throw new Error("文件最大 5 MB。");
      const report = validateUsageImport(
        JSON.parse(content.replace(/^\uFEFF/, "")),
        name || "预览",
        source,
      );
      return { report, error: "" };
    } catch (error) {
      return {
        report: null,
        error:
          error instanceof SyntaxError
            ? "JSON 格式不正确。"
            : error instanceof Error
              ? error.message
              : "无法解析。",
      };
    }
  }, [content, name, source]);
  function loadText(text: string) {
    setContent(text);
    try {
      const parsed = JSON.parse(text.replace(/^\uFEFF/, ""));
      if (target === "new") {
        if (typeof parsed.deviceName === "string")
          setName(parsed.deviceName.slice(0, 100));
        const reportedSource = usageSourceOptions.find(
          (item) => item.value === parsed.source,
        )?.value;
        if (reportedSource) setSource(reportedSource);
      }
    } catch {}
  }
  function chooseTarget(value: string) {
    setTarget(value);
    const device = devices.find((item) => item.id === value);
    setName(device?.name ?? "");
    setSource(device?.source ?? "codex");
  }
  async function submit() {
    if (!inspection.report || busy) return;
    setBusy(true);
    const toastId = toast.loading(
      targetDevice ? "正在更新设备数据…" : "正在导入…",
    );
    try {
      newId.current ??= `device-${crypto.randomUUID().slice(0, 12)}`;
      const response = await fetch("/api/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: targetDevice?.id ?? newId.current,
          name,
          source,
          report: inspection.report,
          replace: Boolean(targetDevice),
          expectedModifiedAt: targetDevice?.importedAt,
        }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "导入失败");
      toast.success(`已${targetDevice ? "更新" : "导入"} ${name}`, {
        id: toastId,
      });
      onClose();
      await onImported();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "导入失败", {
        id: toastId,
      });
    } finally {
      setBusy(false);
    }
  }
  return (
    <Sheet
      open
      onOpenChange={(open) => {
        if (!open && !busy) onClose();
      }}
    >
      <SheetContent className="w-[min(100vw,36rem)] gap-0 overflow-y-auto sm:max-w-none">
        <SheetHeader className="border-b p-6 pr-14">
          <SheetTitle>导入设备用量</SheetTitle>
          <SheetDescription>
            粘贴 ccusage JSON，或选择导出文件。
          </SheetDescription>
        </SheetHeader>
        <div className="space-y-5 p-5 sm:p-6">
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="space-y-2 text-xs text-muted-foreground">
              <span>导入到</span>
              <Choice
                label="导入目标设备"
                value={target}
                onChange={chooseTarget}
                className="w-full"
                options={[
                  { value: "new", label: "新设备" },
                  ...devices
                    .filter((item) => item.kind === "imported")
                    .map((item) => ({
                      value: item.id,
                      label: `更新 ${item.name}`,
                    })),
                ]}
              />
            </label>
            <label className="space-y-2 text-xs text-muted-foreground">
              <span>Agent 来源</span>
              <Choice
                label="导入的 Agent 来源"
                value={source}
                onChange={setSource}
                className="w-full"
                options={usageSourceOptions.map((item) => ({
                  value: item.value,
                  label: item.label,
                }))}
              />
            </label>
          </div>
          <label className="block space-y-2 text-xs text-muted-foreground">
            <span>设备名称</span>
            <Input
              aria-label="设备名称"
              className="h-10"
              maxLength={100}
              placeholder="例如 NVIDIA Jetson Orin Nano"
              value={name}
              onChange={(event) => setName(event.target.value)}
            />
          </label>
          <div className="flex items-center justify-between">
            <span className="text-xs text-muted-foreground">JSON 内容</span>
            <Button
              variant="outline"
              className="h-9 gap-2 text-xs"
              onClick={() => fileInput.current?.click()}
            >
              <Upload className="size-3.5" />
              选择文件
            </Button>
          </div>
          <input
            className="sr-only"
            ref={fileInput}
            type="file"
            aria-label="选择 ccusage JSON 文件"
            accept=".json,application/json"
            onChange={async (event) => {
              const file = event.target.files?.[0];
              if (!file) return;
              if (file.size > importLimit) {
                toast.error("文件最大 5 MB");
                event.target.value = "";
                return;
              }
              try {
                loadText(await file.text());
              } catch {
                toast.error("文件读取失败");
              }
              event.target.value = "";
            }}
          />
          <textarea
            aria-label="ccusage JSON 内容"
            className="min-h-48 w-full resize-y rounded-xl border bg-muted/25 p-3 font-mono text-xs leading-5 outline-none focus-visible:ring-2 focus-visible:ring-ring"
            placeholder={'{ "daily": [ … ] }'}
            value={content}
            onChange={(event) => loadText(event.target.value)}
            spellCheck={false}
          />
          {inspection.error ? (
            <p role="alert" className="text-xs text-destructive">
              {inspection.error}
            </p>
          ) : null}
          {inspection.report ? (
            <div className="flex gap-3 rounded-xl border bg-muted/40 p-4">
              <FileJson className="mt-0.5 size-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
              <div>
                <p className="text-sm font-medium">
                  {inspection.report.daily.length} 个记录日 ·{" "}
                  {formatTokens(
                    inspection.report.daily.reduce(
                      (sum, row) => sum + row.totalTokens,
                      0,
                    ),
                  )}{" "}
                  token
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {inspection.report.daily[0]?.date} —{" "}
                  {inspection.report.daily.at(-1)?.date}
                </p>
              </div>
            </div>
          ) : null}
          {targetDevice ? (
            <p className="text-xs leading-5 text-muted-foreground">
              更新会替换该设备的旧汇总，并保留上一份本地备份。
            </p>
          ) : null}
          <Button
            className="h-11 w-full gap-2"
            disabled={busy || !inspection.report || !name.trim()}
            onClick={() => void submit()}
          >
            <Upload className="size-4" />
            {busy ? "正在导入…" : targetDevice ? "更新此设备" : "导入新设备"}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
