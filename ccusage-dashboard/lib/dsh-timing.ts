import { logCount, logRecord, logTime, type LogRecord } from "./native-jsonl";
import { timingWindow } from "./performance-types";

/** DSH uses the same turn and step number for retries of a request. */
export function dshStepKey(data: LogRecord) {
  const turn = logCount(data.turn);
  const step = logCount(data.step);
  return turn === undefined || step === undefined
    ? undefined
    : `${turn}:${step}`;
}

export function firstDshOutput(stream: unknown, start: number, end: number) {
  if (!Array.isArray(stream)) return;
  let first: number | undefined;
  for (const value of stream) {
    const row = logRecord(value);
    let timestamp: number | undefined;
    if (
      row.type === "text-chunks" ||
      row.type === "reasoning-chunks" ||
      row.type === "tool-call-chunks"
    ) {
      const first = logTime(row.time0);
      const fragments = row.type === "tool-call-chunks" ? row.args : row.texts;
      const offsets = row.dt;
      if (
        first === undefined ||
        !Array.isArray(fragments) ||
        !Array.isArray(offsets) ||
        !fragments.length ||
        offsets.length !== fragments.length - 1
      )
        continue;
      let at = first;
      for (let i = 0; i < fragments.length; i++) {
        if (i) {
          const delta = logCount(offsets[i - 1]);
          if (delta === undefined) break;
          at += delta;
        }
        const fragment = fragments[i];
        if (typeof fragment !== "string") break;
        if (
          fragment.length > 0 ||
          (row.type === "tool-call-chunks" &&
            typeof row.name === "string" &&
            row.name.length > 0)
        ) {
          timestamp = at;
          break;
        }
      }
    } else if (row.type === "chunk") {
      const chunk = logRecord(row.chunk);
      // Do not mistake a usage/finish/error event or empty block for first output.
      const nonempty = (part: unknown) =>
        typeof part === "string" && part.length > 0;
      if (
        ((chunk.type === "text-delta" || chunk.type === "reasoning-delta") &&
          nonempty(chunk.text)) ||
        (chunk.type === "tool-call-delta" &&
          (nonempty(chunk.argumentsDelta) || nonempty(chunk.name)))
      )
        timestamp = logTime(row.time);
    }
    if (timestamp !== undefined && timestamp >= start && timestamp <= end)
      first = Math.min(first ?? timestamp, timestamp);
  }
  return first;
}

export function dshRequestWindow(
  start: number | undefined,
  end: number,
  stream: unknown,
) {
  return timingWindow(
    start,
    end,
    start !== undefined ? firstDshOutput(stream, start, end) : undefined,
  );
}
