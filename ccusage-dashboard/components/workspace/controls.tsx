"use client";

import { SearchX } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

export function Choice<T extends string>({
  label,
  value,
  options,
  onChange,
  className,
}: {
  label: string;
  value: T;
  options: ReadonlyArray<{ value: T; label: string }>;
  onChange: (value: T) => void;
  className?: string;
}) {
  return (
    <Select
      value={value}
      onValueChange={(next) => {
        if (next) onChange(next as T);
      }}
    >
      <SelectTrigger
        aria-label={label}
        className={cn("h-10 min-w-0 bg-card px-3", className)}
      >
        <span className="min-w-0 flex-1 truncate text-left">
          {options.find((item) => item.value === value)?.label ?? value}
        </span>
      </SelectTrigger>
      <SelectContent
        align="start"
        alignItemWithTrigger={false}
        className="max-w-[min(90vw,30rem)] p-1"
      >
        {options.map((item) => (
          <SelectItem
            className="min-h-9 px-2"
            key={item.value}
            value={item.value}
          >
            {item.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

export function Segmented<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: ReadonlyArray<{ value: T; label: string }>;
  onChange: (value: T) => void;
}) {
  return (
    <div
      role="group"
      aria-label={label}
      className="inline-flex max-w-full gap-0.5 rounded-lg bg-muted/70 p-1"
    >
      {options.map((item) => (
        <Button
          key={item.value}
          variant="ghost"
          aria-pressed={value === item.value}
          className={cn(
            "h-8 rounded-md px-3 text-xs",
            value === item.value &&
              "bg-background shadow-sm hover:bg-background",
          )}
          onClick={() => onChange(item.value)}
        >
          {item.label}
        </Button>
      ))}
    </div>
  );
}

export function Empty({
  title = "这个范围没有记录",
  detail,
  action,
}: {
  title?: string;
  detail?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex min-h-64 flex-col items-center justify-center gap-3 rounded-xl border border-dashed p-6 text-center">
      <span className="grid size-11 place-items-center rounded-full bg-muted">
        <SearchX className="size-5 text-muted-foreground" />
      </span>
      <p className="text-sm font-medium">{title}</p>
      {detail ? (
        <p className="max-w-sm text-xs leading-5 text-muted-foreground">
          {detail}
        </p>
      ) : null}
      {action}
    </div>
  );
}
