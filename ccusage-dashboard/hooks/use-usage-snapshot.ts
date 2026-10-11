"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type {
  UsageDevice,
  UsageSnapshot,
  UsageSource,
} from "@/lib/usage-types";

export type UsageRequest = {
  days: string;
  device: string;
  source: UsageSource;
  startDate?: string;
  endDate?: string;
  timezone: string;
};
type LoadState = {
  key: string;
  snapshot: UsageSnapshot | null;
  loading: boolean;
  error: string | null;
};

export function requestKey(request: UsageRequest) {
  return new URLSearchParams({
    days: request.days,
    device: request.device,
    source: request.source,
    timezone: request.timezone,
    ...(request.startDate ? { start: request.startDate } : {}),
    ...(request.endDate ? { end: request.endDate } : {}),
  }).toString();
}

export function useUsageSnapshot(request: UsageRequest) {
  const key = requestKey(request);
  const [state, setState] = useState<LoadState>({
    key: "",
    snapshot: null,
    loading: true,
    error: null,
  });
  const [devices, setDevices] = useState<UsageDevice[]>([]);
  const controller = useRef<AbortController | null>(null);
  const sequence = useRef(0);

  const load = useCallback(async () => {
    controller.current?.abort();
    const abort = new AbortController();
    controller.current = abort;
    const version = ++sequence.current;
    setState((previous) => ({
      key,
      snapshot: previous.key === key ? previous.snapshot : null,
      loading: true,
      error: null,
    }));
    try {
      const response = await fetch("/api/usage?" + key, {
        signal: abort.signal,
        cache: "no-store",
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? "读取失败，请重试。");
      if (version !== sequence.current || abort.signal.aborted) return null;
      const snapshot = payload as UsageSnapshot;
      setDevices(snapshot.devices);
      setState({ key, snapshot, loading: false, error: null });
      return snapshot;
    } catch (error) {
      if (abort.signal.aborted || version !== sequence.current) return null;
      const message =
        error instanceof Error ? error.message : "读取失败，请重试。";
      setState((previous) => ({
        key,
        snapshot: previous.key === key ? previous.snapshot : null,
        loading: false,
        error: message,
      }));
      throw new Error(message);
    }
  }, [key]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void load().catch(() => {});
    }, 0);
    return () => {
      window.clearTimeout(timer);
      controller.current?.abort();
    };
  }, [load]);

  // Never present an old scope under newly applied controls, even for one render.
  const current =
    state.key === key
      ? state
      : { key, snapshot: null, loading: true, error: null };
  return { ...current, devices, refresh: load };
}
