"use client";

import { useState } from "react";
import { CalendarDays, ChevronDown } from "lucide-react";
import { zhCN } from "date-fns/locale";
import type { DateRange } from "react-day-picker";
import { Calendar } from "@/components/ui/calendar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { dateKey, resolveUsageRange, validDateKey } from "@/lib/usage-range";
import type { WorkspaceState } from "@/lib/workspace-state";

export function RangeControl({
  scope,
  onChange,
}: {
  scope: WorkspaceState;
  onChange: (patch: Partial<WorkspaceState>) => void;
}) {
  const [open, setOpen] = useState(false);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [error, setError] = useState("");
  const [month, setMonth] = useState(new Date());
  const label =
    scope.start && scope.end
      ? `${scope.start.replaceAll("-", "/")} – ${scope.end.slice(5).replace("-", "/")}`
      : `最近 ${scope.days} 天`;
  function initialize(next: boolean) {
    if (next) {
      try {
        const range = resolveUsageRange({
          days: Number(scope.days),
          start: scope.start,
          end: scope.end,
        });
        setFrom(range.start);
        setTo(range.end);
        setMonth(new Date(range.start + "T12:00:00"));
      } catch {
        const range = resolveUsageRange({ days: 14 });
        setFrom(range.start);
        setTo(range.end);
        setMonth(new Date(range.start + "T12:00:00"));
      }
      setError("");
    }
    setOpen(next);
  }
  function apply() {
    try {
      const range = resolveUsageRange({ start: from, end: to });
      onChange({ start: range.start, end: range.end });
      setOpen(false);
    } catch (error) {
      setError(error instanceof Error ? error.message : "请选择有效日期。");
    }
  }
  const selected: DateRange | undefined = validDateKey(from)
    ? {
        from: new Date(from + "T12:00:00"),
        to: validDateKey(to) ? new Date(to + "T12:00:00") : undefined,
      }
    : undefined;
  return (
    <Popover open={open} onOpenChange={initialize}>
      <PopoverTrigger
        render={
          <Button
            className="col-span-2 h-10 w-full justify-between gap-2 bg-card px-3 font-normal sm:w-auto"
            variant="outline"
          />
        }
        aria-label="选择日期范围"
      >
        <CalendarDays className="size-4 text-muted-foreground" />
        <span className="truncate">{label}</span>
        <ChevronDown className="size-3.5 text-muted-foreground" />
      </PopoverTrigger>
      <PopoverContent
        align="end"
        className="max-h-[85svh] w-[min(92vw,24rem)] overflow-auto p-4"
      >
        <div className="grid grid-cols-4 gap-1">
          {[7, 14, 30, 90].map((days) => (
            <Button
              key={days}
              variant="secondary"
              className="h-9 text-xs"
              onClick={() => {
                onChange({
                  days: String(days),
                  start: undefined,
                  end: undefined,
                });
                setOpen(false);
              }}
            >
              {days} 天
            </Button>
          ))}
        </div>
        <div className="mt-4 grid grid-cols-2 gap-2">
          <label className="space-y-1.5 text-xs text-muted-foreground">
            开始日期
            <Input
              className="mt-1.5 text-xs"
              aria-label="开始日期"
              type="date"
              value={from}
              max={dateKey(new Date())}
              onInput={(event) => {
                const value = event.currentTarget.value;
                setFrom(value);
                if (validDateKey(value))
                  setMonth(new Date(value + "T12:00:00"));
              }}
            />
          </label>
          <label className="space-y-1.5 text-xs text-muted-foreground">
            结束日期
            <Input
              className="mt-1.5 text-xs"
              aria-label="结束日期"
              type="date"
              value={to}
              max={dateKey(new Date())}
              onInput={(event) => setTo(event.currentTarget.value)}
            />
          </label>
        </div>
        <Calendar
          className="mx-auto mt-2"
          key={open ? "open" : "closed"}
          locale={zhCN}
          mode="range"
          selected={selected}
          month={month}
          onMonthChange={setMonth}
          disabled={{ after: new Date() }}
          onSelect={(range) => {
            setFrom(range?.from ? dateKey(range.from) : "");
            setTo(range?.to ? dateKey(range.to) : "");
          }}
        />
        {error ? (
          <p role="alert" className="mb-3 text-xs text-destructive">
            {error}
          </p>
        ) : null}
        <Button className="h-10 w-full" disabled={!from || !to} onClick={apply}>
          应用日期
        </Button>
      </PopoverContent>
    </Popover>
  );
}
