"use client";

import { Moon, Sun } from "lucide-react";
import { Switch, SwitchThumb } from "@/components/ui/switch";
import { useTheme } from "@/hooks/use-theme";
import { cn } from "@/lib/utils";

export function ThemeToggle({ className }: { className?: string }) {
  const { dark, setDark } = useTheme();
  return (
    <div
      className={cn(
        "inline-flex h-9 shrink-0 items-center gap-2 rounded-lg border bg-background px-2",
        className,
      )}
    >
      <Sun className="size-3.5 text-muted-foreground" aria-hidden="true" />
      <Switch
        aria-label="切换黑白模式"
        checked={dark}
        onCheckedChange={setDark}
      >
        <SwitchThumb>
          {dark ? <Moon className="size-3" /> : <Sun className="size-3" />}
        </SwitchThumb>
      </Switch>
      <Moon className="size-3.5 text-muted-foreground" aria-hidden="true" />
    </div>
  );
}
