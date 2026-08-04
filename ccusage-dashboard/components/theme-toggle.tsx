"use client"

import { Moon, Sun } from "lucide-react"
import { useSyncExternalStore } from "react"

import { Switch, SwitchThumb } from "@/components/ui/switch"
import { cn } from "@/lib/utils"

const themeStorageKey = "usage-console-theme"
const themeChangeEvent = "usage-console-theme-change"

function subscribeToTheme(callback: () => void) {
  window.addEventListener(themeChangeEvent, callback)
  window.addEventListener("storage", callback)

  return () => {
    window.removeEventListener(themeChangeEvent, callback)
    window.removeEventListener("storage", callback)
  }
}

function getThemeSnapshot() {
  return document.documentElement.classList.contains("dark")
}

function ThemeToggle({ className }: { className?: string }) {
  const isDark = useSyncExternalStore(subscribeToTheme, getThemeSnapshot, () => false)

  function setTheme(dark: boolean) {
    document.documentElement.classList.toggle("dark", dark)
    document.documentElement.style.colorScheme = dark ? "dark" : "light"
    try {
      window.localStorage.setItem(themeStorageKey, dark ? "dark" : "light")
    } catch {
      // The theme still works when browser storage is unavailable.
    }
    window.dispatchEvent(new Event(themeChangeEvent))
  }

  return (
    <div
      className={cn(
        "inline-flex shrink-0 items-center gap-2 rounded-lg border bg-background/70 px-2 py-1",
        className
      )}
    >
      <Sun className="size-3.5 text-muted-foreground" aria-hidden="true" />
      <Switch
        aria-label="切换黑白模式"
        checked={isDark}
        onCheckedChange={setTheme}
      >
        <SwitchThumb>
          {isDark ? (
            <Moon className="size-3 text-foreground" aria-hidden="true" />
          ) : (
            <Sun className="size-3 text-foreground" aria-hidden="true" />
          )}
        </SwitchThumb>
      </Switch>
      <Moon className="size-3.5 text-muted-foreground" aria-hidden="true" />
      <span className="sr-only">当前为{isDark ? "深色" : "浅色"}模式</span>
    </div>
  )
}

export { ThemeToggle }
