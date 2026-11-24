import type { Dirent } from "node:fs";
import { opendir, stat } from "node:fs/promises";
import type {
  TimingAgent,
  TimingCoverage,
  TimingEvidence,
} from "./performance-types";
import {
  TIMING_BATCH_BYTES,
  TIMING_BATCH_FILES,
  TIMING_BATCH_MS,
  TIMING_FILE_BYTES,
  TIMING_FILE_SAMPLES,
  TIMING_INVENTORY_LIMIT,
  TIMING_INVENTORY_MS,
  TIMING_SCOPE_FILES,
  type TimingBudget,
  type TimingRead,
} from "./timing-limits";

export type TimingFile = { path: string; size: number; modified: number };
export async function timingFile(path: string): Promise<TimingFile> {
  const info = await stat(/* turbopackIgnore: true */ path);
  return { path, size: info.size, modified: info.mtimeMs };
}

type Projection = TimingRead & {
  samples: TimingEvidence[];
  skipped?: boolean;
  session?: string;
};
type Cached = {
  size: number;
  modified: number;
  parsed: Projection;
  retryEarly: boolean;
};
type Index = {
  files: Map<string, Cached>;
  batch?: Promise<void>;
  preferUnseen: boolean;
};
const indexes = new Map<string, Index>();

/** Limit directory work before any file decode; do not open private file contents. */
export function timingInventory() {
  const deadline = Date.now() + TIMING_INVENTORY_MS;
  let entries = 0;
  let truncated = false;
  function timeLimitReached() {
    if (Date.now() < deadline) return false;
    truncated = true;
    return true;
  }
  function directoryLimitReached() {
    if (entries < TIMING_INVENTORY_LIMIT) return timeLimitReached();
    truncated = true;
    return true;
  }
  async function children(path: string): Promise<Dirent[]> {
    if (directoryLimitReached()) return [];
    const dir = await opendir(/* turbopackIgnore: true */ path);
    const found: Dirent[] = [];
    for await (const item of dir) {
      if (directoryLimitReached()) break;
      entries++;
      found.push(item);
    }
    return found;
  }
  return {
    children,
    timeLimitReached,
    get truncated() {
      return truncated;
    },
  };
}

/** Bounded per-root batches; consumers choose order and share a single in-flight scan. */
export async function indexTimingFiles<T extends TimingFile>(
  agent: TimingAgent,
  root: string,
  files: readonly T[],
  parse: (file: T, budget: TimingBudget) => Promise<Projection>,
  errors: number,
  incompleteInventory = false,
) {
  const key = agent + ":" + root;
  let index = indexes.get(key);
  if (!index) {
    // The production process has only two configured roots; still bound
    // retention if more roots are supplied by programmatic callers.
    if (indexes.size >= 4) {
      const oldest = [...indexes].find(([, item]) => !item.batch);
      if (!oldest)
        return {
          coverage: {
            agent,
            scanned: 0,
            pending: Math.min(TIMING_SCOPE_FILES, files.length),
            skipped: errors,
            limited:
              Math.max(0, files.length - TIMING_SCOPE_FILES) +
              Number(incompleteInventory),
          },
          evidence: [],
        };
      indexes.delete(oldest[0]);
    }
    index = { files: new Map(), preferUnseen: false };
    indexes.set(key, index);
  } else {
    indexes.delete(key);
    indexes.set(key, index);
  }
  const cache = index.files;
  const selected = files.slice(0, TIMING_SCOPE_FILES);
  const lookup = ({ path, size, modified }: TimingFile) => {
    const c = cache.get(path);
    return c?.size === size && c.modified === modified ? c : undefined;
  };
  if (!index.batch) {
    const target = index;
    // A very large active rollout can change every poll; alternate priority
    // so it cannot starve historical files during the initial scan.
    const queue = target.preferUnseen
      ? [
          ...selected.filter(({ path }) => !cache.has(path)),
          ...selected.filter(({ path }) => cache.has(path)),
        ]
      : selected;
    target.preferUnseen = !target.preferUnseen;
    target.batch = (async () => {
      let bytes = 0;
      let parsed = 0;
      const deadline = Date.now() + TIMING_BATCH_MS;
      const keep = new Set(selected.map(({ path }) => path));
      for (const path of cache.keys()) if (!keep.has(path)) cache.delete(path);
      const shorted = queue.find((file) => lookup(file)?.retryEarly);
      const ordered = shorted
        ? [shorted, ...queue.filter((f) => f !== shorted)]
        : queue;
      for (const file of ordered) {
        const prior = lookup(file);
        if (prior && !prior.retryEarly) continue;
        // Every file, including the first, receives an in-decoder budget.
        if (
          parsed >= TIMING_BATCH_FILES ||
          bytes + TIMING_FILE_BYTES > TIMING_BATCH_BYTES ||
          Date.now() >= deadline
        )
          break;
        const value = await parse(file, {
          maxBytes: TIMING_FILE_BYTES,
          deadline,
        }).catch(
          (): Projection => ({
            samples: [],
            skipped: true,
            limited: false,
            decodedBytes: TIMING_FILE_BYTES,
          }),
        );
        if (value.samples.length > TIMING_FILE_SAMPLES) {
          value.samples = value.samples.slice(-TIMING_FILE_SAMPLES);
          value.limited = true;
        }
        cache.set(file.path, {
          size: file.size,
          modified: file.modified,
          parsed: value,
          // Give a file interrupted late in a shared batch one attempt with
          // a fresh deadline, without repeatedly retrying a too-large file.
          retryEarly: Boolean(value.timedOut && parsed > 0),
        });
        bytes += value.decodedBytes;
        parsed++;
      }
    })();
    try {
      await target.batch;
    } finally {
      target.batch = undefined;
    }
  } else await index.batch;

  const coverage: TimingCoverage = {
    agent,
    scanned: 0,
    pending: 0,
    skipped: errors,
    limited: files.length - selected.length + Number(incompleteInventory),
  };
  const evidence: TimingEvidence[] = [];
  const sessions = new Set<string>();
  for (const file of selected) {
    const parsed = lookup(file)?.parsed;
    if (!parsed) coverage.pending++;
    else if (parsed.skipped && !parsed.limited) coverage.skipped++;
    else {
      if (parsed.limited) coverage.limited++;
      else coverage.scanned++;
      if (parsed.session && sessions.has(parsed.session)) continue;
      if (parsed.session) sessions.add(parsed.session);
      for (const sample of parsed.samples) evidence.push(sample);
    }
  }
  return { coverage, evidence };
}
