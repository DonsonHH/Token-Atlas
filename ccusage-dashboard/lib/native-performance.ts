import { homedir } from "node:os";
import { join } from "node:path";
import { readCodexTiming } from "./codex-timing";
import {
  outputSpeed,
  type PerformanceReport,
  type RequestSample,
  type TimingEvidence,
  type TimingStats,
} from "./performance-types";
import { canonicalModelName } from "./model-names";
import type { UsageRange } from "./usage-range";

const counter = () => ({
  requests: 0,
  tokens: 0,
  ms: 0,
  speedSamples: 0,
  first: [] as number[],
});
type Counter = ReturnType<typeof counter>;

function collect(result: Counter, row: TimingEvidence) {
  result.requests++;
  if (row.firstTokenMs !== null) result.first.push(row.firstTokenMs);
  if (outputSpeed(row) !== null) {
    result.speedSamples++;
    result.tokens += row.outputTokens;
    result.ms += row.durationMs ?? 0;
  }
}

function summarize({
  requests,
  tokens,
  ms,
  speedSamples,
  first,
}: Counter): TimingStats {
  first.sort((a, b) => a - b);
  const midpoint = Math.floor(first.length / 2);
  return {
    requests,
    speed: speedSamples
      ? { value: (tokens * 1000) / ms, samples: speedSamples }
      : null,
    firstToken: first.length
      ? {
          value:
            first.length % 2
              ? first[midpoint]
              : (first[midpoint - 1] + first[midpoint]) / 2,
          samples: first.length,
        }
      : null,
  };
}

export async function readNativePerformance(
  range: UsageRange,
  codexHome = process.env.CODEX_HOME ??
    join(process.env.HOME || process.env.USERPROFILE || homedir(), ".codex"),
): Promise<PerformanceReport> {
  const { evidence, coverage } = await readCodexTiming(range, codexHome);
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: range.timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const seen = new Set<string>();
  const total = counter();
  const models = new Map<string, Counter>();
  const recent: RequestSample[] = [];
  for (const row of evidence) {
    const day = formatter.format(row.at);
    if (
      (!range.allTime && day < range.start) ||
      day > range.end ||
      seen.has(row.identity)
    )
      continue;
    seen.add(row.identity);
    const model = canonicalModelName(row.model);
    const group = models.get(model) ?? counter();
    models.set(model, group);
    collect(total, row);
    collect(group, row);
    if (
      (row.durationMs !== null || row.firstTokenMs !== null) &&
      (recent.length < 32 || row.at > recent[31].at)
    ) {
      const { at, agent, outputTokens, durationMs, firstTokenMs } = row;
      const before = recent.findIndex((sample) => sample.at < at);
      recent.splice(before < 0 ? recent.length : before, 0, {
        at,
        agent,
        model,
        outputTokens,
        durationMs,
        firstTokenMs,
      });
      if (recent.length > 32) recent.pop();
    }
  }
  return {
    generatedAt: new Date().toISOString(),
    totals: summarize(total),
    models: [...models.entries()]
      .map(([model, group]) => ({
        model,
        ...summarize(group),
      }))
      .sort(
        (a, b) => b.requests - a.requests || a.model.localeCompare(b.model),
      ),
    recent,
    coverage: [coverage],
  };
}
