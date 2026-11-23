import { join } from "node:path";
import {
  logCount,
  logRecord,
  logText,
  logTime,
  scanJsonl,
} from "./native-jsonl";
import { timingWindow, type TimingEvidence } from "./performance-types";
import { shiftDate, type UsageRange } from "./usage-range";
import {
  indexTimingFiles,
  timingFile,
  timingInventory,
  type TimingFile,
} from "./timing-file-index";
import type { TimingBudget, TimingRead } from "./timing-limits";

type ParsedFile = TimingRead & { samples: TimingEvidence[]; skipped: boolean };
type Rollout = TimingFile & {
  archive: boolean;
  day: string;
};

function usageKey(value: unknown) {
  const usage = logRecord(value);
  const output = logCount(usage.output_tokens);
  const total = logCount(usage.total_tokens);
  if (output === undefined && total === undefined) return;
  return {
    output: output ?? 0,
    fingerprint: JSON.stringify(
      [
        "input_tokens",
        "cached_input_tokens",
        "cache_write_input_tokens",
        "output_tokens",
        "total_tokens",
      ].map((key) => logCount(usage[key]) ?? 0),
    ),
  };
}

async function parseCodexRollout(
  file: Rollout,
  budget: TimingBudget,
): Promise<ParsedFile> {
  const samples: TimingEvidence[] = [];
  let thread: string | undefined;
  let ownedFrom: number | undefined;
  let ambiguous = false;
  let sawHeader = false;
  let turn: string | undefined;
  let model: string | undefined;
  let boundary: number | undefined;
  let started: number | undefined;
  let modelOutput: number | undefined;
  let toolAfterOutput: number | undefined;
  let firstOutput: number | undefined;
  let previousTotals: string | undefined;
  let lastDone:
    | {
        at: number;
        key: string;
        cumulative?: string;
        native: boolean;
        index: number;
        start?: number;
        firstOutput?: number;
      }
    | undefined;
  let newOutput = false;
  const responseIds = new Set<string>();
  const legacyCompletions = new Set<string>();
  const resetRequest = (at?: number) => {
    boundary = at;
    started = undefined;
    modelOutput = undefined;
    toolAfterOutput = undefined;
    firstOutput = undefined;
    newOutput = false;
  };
  function beginOutput(at: number) {
    newOutput = true;
    if (boundary !== undefined && boundary <= at) started ??= boundary;
  }
  function complete(
    at: number,
    usage: NonNullable<ReturnType<typeof usageKey>>,
    completion: { id?: string; cumulative?: string },
  ) {
    const { id, cumulative } = completion;
    const mirror =
      lastDone &&
      !newOutput &&
      Math.abs(at - lastDone.at) <= 1000 &&
      usage.fingerprint === lastDone.key &&
      (!cumulative ||
        !lastDone.cumulative ||
        cumulative === lastDone.cumulative);
    if (!id && mirror && lastDone?.native) return;
    if (id && responseIds.has(id)) return;
    if (id) responseIds.add(id);
    const key = `${thread}:${at}:${usage.fingerprint}`;
    if (!id && legacyCompletions.has(key)) return;
    if (!id) legacyCompletions.add(key);
    if (id && mirror && lastDone && !lastDone.native) {
      const prior = samples[lastDone.index];
      if (prior) {
        prior.identity = `codex:${id}`;
        prior.at = at;
        Object.assign(
          prior,
          timingWindow(lastDone.start, at, lastDone.firstOutput),
        );
        lastDone = {
          ...lastDone,
          at,
          native: true,
          cumulative: cumulative ?? lastDone.cumulative,
        };
        resetRequest(at);
        return;
      }
    }
    if (!usage.output || !model || model === "unknown") {
      resetRequest(at);
      return;
    }
    // If a legacy tokenCount followed a tool result written in the same flush,
    // stop at the last observed model output, never add that tool's runtime.
    const end =
      !id &&
      toolAfterOutput !== undefined &&
      at >= toolAfterOutput &&
      at - toolAfterOutput <= 100
        ? modelOutput
        : at;
    const timing =
      end === undefined
        ? { durationMs: null, firstTokenMs: null }
        : timingWindow(started ?? boundary, end, firstOutput);
    const sample: TimingEvidence = {
      at,
      agent: "codex",
      model,
      outputTokens: usage.output,
      identity: id ? `codex:${id}` : `codex:${key}`,
      ...timing,
    };
    lastDone = {
      at,
      key: usage.fingerprint,
      cumulative,
      native: Boolean(id),
      index: samples.length,
      start: started ?? boundary,
      firstOutput,
    };
    samples.push(sample);
    resetRequest(at);
  }

  const read = await scanJsonl(
    file.path,
    (line) => {
      // Avoid JSON decoding huge embedded transcripts that cannot carry timing.
      const head = line.slice(0, 700);
      if (
        !/"(?:session_meta|turn_context|event_msg|response_item|token_usage_record|compacted)"/.test(
          head,
        )
      )
        return;
      if (
        /"type"\s*:\s*"response_item"/.test(head) &&
        /"type"\s*:\s*"message"/.test(head) &&
        !/"role"\s*:\s*"(?:user|developer|assistant)"/.test(head)
      )
        return;
      const entry = logRecord(JSON.parse(line));
      const data = logRecord(entry.payload);
      if (entry.type === "session_meta") {
        if (sawHeader) return;
        sawHeader = true;
        thread = logText(data.id) ?? logText(data.session_id);
        const subagentStart = logCount(data.subagent_history_start_ordinal);
        const forkCut = logCount(data.forked_from_ordinal_exclusive);
        const ordinal = logCount(entry.ordinal);
        ownedFrom =
          subagentStart ??
          (forkCut !== undefined && ordinal !== undefined && ordinal >= forkCut
            ? forkCut
            : undefined);
        ambiguous = Boolean(
          (logText(data.forked_from_id) ||
            logText(data.parent_thread_id) ||
            logRecord(data.source).subagent) &&
            ownedFrom === undefined,
        );
        return;
      }
      if (!thread || ambiguous) return;
      if (
        ownedFrom !== undefined &&
        (logCount(entry.ordinal) ?? -1) < ownedFrom
      )
        return;
      const at = logTime(entry.timestamp);
      if (at === undefined) return;
      const kind = entry.type === "event_msg" ? data.type : entry.type;
      const eventTurn = logText(data.turn_id);

      if (
        kind === "task_started" ||
        kind === "turn_started" ||
        kind === "turn_aborted" ||
        kind === "task_complete" ||
        kind === "turn_complete" ||
        kind === "compacted"
      ) {
        turn =
          kind === "task_started" || kind === "turn_started"
            ? eventTurn
            : undefined;
        model = undefined;
        lastDone = undefined;
        resetRequest(
          kind === "task_started" || kind === "turn_started" ? at : undefined,
        );
        return;
      }
      if (kind === "turn_context") {
        if (eventTurn && turn && eventTurn !== turn) {
          lastDone = undefined;
          resetRequest(at);
        }
        turn = eventTurn ?? turn;
        model = logText(data.model) ?? model;
        if (started === undefined) boundary = at;
      } else if (
        kind === "item_completed" &&
        (!turn || !eventTurn || eventTurn === turn)
      ) {
        const item = logRecord(data.item);
        const itemStart = logTime(data.started_at_ms);
        if (
          (item.type === "Reasoning" || item.type === "AgentMessage") &&
          itemStart !== undefined &&
          itemStart <= at &&
          (lastDone === undefined || itemStart > lastDone.at)
        ) {
          beginOutput(itemStart);
          firstOutput = Math.min(firstOutput ?? itemStart, itemStart);
          modelOutput = at;
        } else if (item.type === "CommandExecution") {
          if (modelOutput !== undefined) toolAfterOutput = at;
          boundary = at;
        }
      } else if (kind === "response_item") {
        const type = logText(data.type);
        const isOutput =
          (type === "message" && data.role === "assistant") ||
          type === "reasoning" ||
          type?.endsWith("_call");
        if (isOutput) {
          // Old logs can persist a finished response item just after its count.
          if (lastDone && at - lastDone.at <= 100 && started === undefined)
            return;
          beginOutput(at);
          modelOutput = at;
          toolAfterOutput = undefined;
        } else if (type?.endsWith("_output")) {
          if (modelOutput !== undefined) toolAfterOutput = at;
          boundary = at;
        } else if (
          started === undefined &&
          type === "message" &&
          (data.role === "user" || data.role === "developer")
        ) {
          boundary = at;
        }
      } else if (
        kind === "token_usage_record" &&
        (!turn || !eventTurn || turn === eventTurn)
      ) {
        const usage = usageKey(data.usage);
        const id = logText(data.response_id);
        const owner = logText(data.thread_id);
        if (usage && id && (!owner || owner === thread))
          complete(at, usage, {
            id,
            cumulative: usageKey(data.thread_token_usage)?.fingerprint,
          });
      } else if (kind === "token_count") {
        const info = logRecord(data.info);
        const cumulative = usageKey(info.total_token_usage);
        if (
          cumulative?.fingerprint &&
          previousTotals === cumulative.fingerprint
        )
          return;
        if (cumulative) previousTotals = cumulative.fingerprint;
        const usage = usageKey(info.last_token_usage);
        if (usage?.output)
          complete(at, usage, { cumulative: cumulative?.fingerprint });
      }
    },
    file.size,
    budget.maxBytes,
    budget,
  );
  return { ...read, samples, skipped: !sawHeader || !thread || ambiguous };
}

const rolloutName =
  /^rollout-(\d{4}-\d{2}-\d{2})T.*[0-9a-f-]{36}\.jsonl(?:\.zst(?:d)?)?$/i;

async function listRollouts(homes: readonly string[], range: UsageRange) {
  const seen = new Map<string, Rollout>();
  const inventory = timingInventory();
  const end = shiftDate(range.end, 1);
  const start = range.allTime ? undefined : shiftDate(range.start, -1);
  const earliestMtime = start ? Date.parse(start) : 0;
  let errors = 0;
  async function walk(path: string, archive: boolean, root = false) {
    try {
      const entries = await inventory.children(path);
      // Avoid Promise.all per file: hundreds of concurrent handles can starve the dashboard.
      for (const entry of entries) {
        if (inventory.exhausted()) break;
        const full = join(path, entry.name);
        if (entry.isDirectory()) {
          await walk(full, archive);
          continue;
        }
        const day = entry.isFile()
          ? rolloutName.exec(entry.name)?.[1]
          : undefined;
        if (!day || day > end) continue;
        const key = entry.name.replace(/\.zst(?:d)?$/, "");
        try {
          const file = await timingFile(full);
          // An older rollout remains eligible if it was written during this
          // range (long sessions can continue on a different day).
          if (start && day < start && file.modified < earliestMtime) continue;
          const prior = seen.get(key);
          if (
            !prior ||
            (prior.archive && !archive) ||
            (prior.archive === archive &&
              (prior.modified < file.modified ||
                (prior.modified === file.modified && full.endsWith(".jsonl"))))
          ) {
            seen.set(key, {
              ...file,
              day,
              archive,
            });
          }
        } catch {
          errors++;
        }
      }
    } catch (error) {
      if (!(root && (error as NodeJS.ErrnoException).code === "ENOENT"))
        errors++;
    }
  }
  for (const home of homes) {
    await walk(join(home, "sessions"), false, true);
    await walk(join(home, "archived_sessions"), true, true);
  }
  return { files: [...seen.values()], errors, truncated: inventory.truncated };
}

/** A bounded read indexes new or changed rollouts; unchanged files aren't decoded twice. */
export async function readCodexTiming(range: UsageRange, home: string) {
  const homes = [
    ...new Set(
      home
        .split(",")
        .map((path) => path.trim())
        .filter(Boolean),
    ),
  ];
  const { files, errors, truncated } = await listRollouts(homes, range);
  // Prefer the requested dates in the initial batch; older files may be
  // continued later, so they are still eligible as the index warms.
  const orderStart = range.allTime ? shiftDate(range.end, -14) : range.start;
  const rank = (file: Rollout) => (file.day >= orderStart ? 0 : 1);
  files.sort(
    (a, b) =>
      rank(a) - rank(b) ||
      b.modified - a.modified ||
      b.day.localeCompare(a.day),
  );
  return indexTimingFiles(
    "codex",
    JSON.stringify(homes),
    files,
    parseCodexRollout,
    errors,
    truncated,
  );
}
