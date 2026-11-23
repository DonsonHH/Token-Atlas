"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  PERFORMANCE_REFRESH_MS,
  type PerformanceReport,
} from "@/lib/performance-types";
import { watchVisibleRefresh } from "@/lib/visible-refresh";

export type PerformanceState = {
  report: PerformanceReport | null;
  reading: boolean;
  error: string | null;
  unavailable: string | null;
};

const empty: PerformanceState = {
  report: null,
  reading: false,
  error: null,
  unavailable: null,
};
type KeyedState = PerformanceState & { key: string | null };

export function usePerformanceReport(
  key: string | null,
  unavailable: string | null,
  usageReady: boolean,
) {
  const [state, setState] = useState<KeyedState>({ ...empty, key: null });
  const pending = useRef<{
    key: string;
    abort: AbortController;
    done: Promise<PerformanceReport | null>;
  } | null>(null);
  const refresh = useCallback(() => {
    if (!key) return Promise.resolve(null);
    if (pending.current?.key === key && !pending.current.abort.signal.aborted)
      return pending.current.done;
    pending.current?.abort.abort();
    const abort = new AbortController();
    setState((previous) =>
      previous.key === key
        ? { ...previous, reading: true, error: null }
        : { ...empty, key, reading: true },
    );
    const done = (async () => {
      try {
        const response = await fetch("/api/performance?" + key, {
          signal: abort.signal,
          cache: "no-store",
          headers: { "X-Token-Atlas-Performance": "1" },
        });
        const payload = await response.json();
        if (!response.ok)
          throw new Error(payload.error ?? "本机计时读取失败。");
        if (abort.signal.aborted) return null;
        const report = payload as PerformanceReport;
        setState({ ...empty, key, report });
        return report;
      } catch (error) {
        if (abort.signal.aborted) return null;
        const message =
          error instanceof Error ? error.message : "本机计时读取失败。";
        setState((previous) => ({
          ...empty,
          key,
          report: previous.key === key ? previous.report : null,
          error: message,
        }));
        // Only manual refresh consumes the rejection. The visibility watcher
        // catches background failures and leaves the inline state to the UI.
        throw new Error(message);
      } finally {
        if (pending.current?.abort === abort) pending.current = null;
      }
    })();
    pending.current = { key, abort, done };
    return done;
  }, [key]);
  useEffect(() => {
    if (key === null || !usageReady) return;
    const stop = watchVisibleRefresh(
      document,
      async () => {
        await refresh();
      },
      PERFORMANCE_REFRESH_MS,
      {
        set: (run, delay) => window.setTimeout(run, delay),
        clear: (timer) => window.clearTimeout(timer),
      },
    );
    return () => {
      stop();
      if (pending.current?.key === key) pending.current.abort.abort();
    };
  }, [key, refresh, usageReady]);
  return {
    ...(state.key === key ? state : { ...empty, reading: key !== null }),
    unavailable,
    refresh,
  };
}
