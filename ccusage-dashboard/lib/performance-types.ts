export type TimingAgent = "codex" | "dsh";
export const PERFORMANCE_REFRESH_MS = 60_000;

/** The public projection contains no session, response or request IDs. */
export type RequestSample = {
  at: number;
  agent: TimingAgent;
  model: string;
  outputTokens: number;
  durationMs: number | null;
  firstTokenMs: number | null;
};
/** Server-only identity, stripped when constructing the public report. */
export type TimingEvidence = RequestSample & { identity: string };

export type TimingMetric = { value: number; samples: number };
export type TimingStats = {
  requests: number;
  speed: TimingMetric | null;
  firstToken: TimingMetric | null;
};
export type TimingModel = TimingStats & {
  model: string;
  agents: TimingAgent[];
};
export type TimingCoverage = {
  agent: TimingAgent;
  scanned: number;
  pending: number;
  skipped: number;
  limited: number;
};

export type PerformanceReport = {
  generatedAt: string;
  totals: TimingStats;
  models: TimingModel[];
  recent: RequestSample[];
  coverage: TimingCoverage[];
};

export function timingWindow(
  start: number | undefined,
  finish: number,
  output: number | undefined,
): Pick<RequestSample, "durationMs" | "firstTokenMs"> {
  const duration = start === undefined ? 0 : finish - start;
  const latency =
    start === undefined || output === undefined ? 0 : output - start;
  const valid = duration >= 100 && duration <= 3_600_000;
  return {
    durationMs: valid ? duration : null,
    firstTokenMs: valid && latency > 0 && latency <= duration ? latency : null,
  };
}

export function outputSpeed(
  sample: Pick<RequestSample, "outputTokens" | "durationMs">,
): number | null {
  return sample.outputTokens >= 200 &&
    sample.durationMs !== null &&
    sample.durationMs >= 1000
    ? (sample.outputTokens * 1000) / sample.durationMs
    : null;
}
