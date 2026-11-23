import type { PerformanceReport } from "./performance-types";
import { TIMING_REPORT_TTL_MS } from "./timing-limits";

type Reader = () => Promise<PerformanceReport>;

/** One bounded scan at a time. No queue of abandoned scope changes. */
export function createPerformanceReader(now = Date.now) {
  const recent = new Map<
    string,
    { report: PerformanceReport; readAt: number }
  >();
  let active: { key: string; promise: Promise<PerformanceReport> } | undefined;
  return function read(key: string, build: Reader) {
    const last = recent.get(key);
    if (last && now() - last.readAt < TIMING_REPORT_TTL_MS)
      return Promise.resolve(last.report);
    if (active?.key === key) return active.promise;
    if (active) return null;
    const promise = Promise.resolve()
      .then(build)
      .then((report) => {
        recent.delete(key);
        recent.set(key, { report, readAt: now() });
        for (const stored of recent.keys()) {
          if (recent.size <= 4) break;
          recent.delete(stored);
        }
        return report;
      })
      .finally(() => {
        active = undefined;
      });
    active = { key, promise };
    return promise;
  };
}

export const readPerformanceOnce = createPerformanceReader();
