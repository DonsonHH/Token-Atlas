"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import type {
  UsageDeviceFilter,
  UsageSnapshot,
  UsageSource,
} from "@/lib/usage";

type UsageRequest = {
  days: string;
  device: UsageDeviceFilter;
  source: UsageSource;
};

type UsageErrorPayload = {
  error?: string;
};

function messageFromError(error: unknown): string {
  return error instanceof Error ? error.message : "读取数据失败。";
}

async function fetchUsageSnapshot(
  request: UsageRequest,
  signal?: AbortSignal
): Promise<UsageSnapshot> {
  const query = new URLSearchParams({
    days: request.days,
    device: request.device,
    source: request.source,
  });
  const response = await fetch("/api/usage?" + query, {
    cache: "no-store",
    signal,
  });
  const payload = (await response.json()) as UsageSnapshot & UsageErrorPayload;

  if (!response.ok) {
    throw new Error(payload.error ?? "读取数据失败。");
  }

  return payload;
}

export function useUsageSnapshot(request: UsageRequest) {
  const { days, device, source } = request;
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [snapshot, setSnapshot] = useState<UsageSnapshot | null>(null);
  const requestId = useRef(0);

  const load = useCallback(
    async (signal?: AbortSignal) => {
      const currentRequestId = ++requestId.current;
      setLoading(true);
      setError(null);

      try {
        const nextSnapshot = await fetchUsageSnapshot(
          { days, device, source },
          signal
        );
        if (currentRequestId === requestId.current && !signal?.aborted) {
          setSnapshot(nextSnapshot);
        }
      } catch (loadError) {
        if (signal?.aborted || currentRequestId !== requestId.current) return;

        setError(messageFromError(loadError));
      } finally {
        if (currentRequestId === requestId.current && !signal?.aborted) {
          setLoading(false);
        }
      }
    },
    [days, device, source]
  );

  useEffect(() => {
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      void load(controller.signal);
    }, 0);

    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [load]);

  const refresh = useCallback(() => load(), [load]);

  return { error, loading, refresh, snapshot };
}
