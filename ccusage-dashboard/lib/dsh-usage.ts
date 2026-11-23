import { readdir } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import {
  addUsageTotals,
  createEmptyTotals,
  mergeUsagePeriods,
} from "./usage-domain";
import { dateKey, shiftDate, type UsageRange } from "./usage-range";
import { estimateDshRequest, type DshRateCard } from "./dsh-pricing";
import { canonicalModelName } from "./model-names";
import { dshRequestWindow, dshStepKey } from "./dsh-timing";
import { logTime, scanJsonl } from "./native-jsonl";
import {
  indexTimingFiles,
  timingFile,
  timingInventory,
  type TimingFile,
} from "./timing-file-index";
import type { TimingBudget } from "./timing-limits";
import type { TimingEvidence } from "./performance-types";
import type {
  LocalUsageReport,
  UsagePeriod,
  UsageSession,
  UsageTotals,
} from "./usage-types";

type Row = Record<string, unknown>;
type DshReport = LocalUsageReport & { detected: boolean };
const record = (value: unknown): Row =>
  value && typeof value === "object" && !Array.isArray(value)
    ? (value as Row)
    : {};
const text = (value: unknown) =>
  typeof value === "string" && value.trim() ? value.trim() : undefined;
const numericFields = [
  "inputTokens",
  "outputTokens",
  "cacheReadTokens",
  "cacheCreationTokens",
  "totalTokens",
  "reasoningOutputTokens",
  "cacheWriteTokens",
  "reasoningTokens",
] as const;

function tokenAlias(usage: Row, native: string, compatible: string): number {
  if (
    usage[native] !== undefined &&
    usage[compatible] !== undefined &&
    usage[native] !== usage[compatible]
  )
    throw new Error("同一用量字段存在冲突口径");
  return Number(usage[native] ?? usage[compatible] ?? 0);
}

function usageFrom(
  value: unknown,
  model: string,
  at: Date,
): { totals: UsageTotals; rateCard?: DshRateCard } | null {
  const usage = record(value);
  if (!numericFields.some((field) => usage[field] !== undefined)) return null;
  for (const key of numericFields) {
    if (
      usage[key] !== undefined &&
      (!Number.isSafeInteger(usage[key]) || Number(usage[key]) < 0)
    ) {
      throw new Error("用量字段无效");
    }
  }
  const inputTokens = Number(usage.inputTokens ?? 0);
  const outputTokens = Number(usage.outputTokens ?? 0);
  const cacheReadTokens = Number(usage.cacheReadTokens ?? 0);
  const cacheCreationTokens = tokenAlias(
    usage,
    "cacheWriteTokens",
    "cacheCreationTokens",
  );
  const totalTokens = Number(
    usage.totalTokens ??
      inputTokens + outputTokens + cacheReadTokens + cacheCreationTokens,
  );
  if (!Number.isSafeInteger(totalTokens))
    throw new Error("用量超出安全整数范围");
  const counts = {
    inputTokens,
    outputTokens,
    cacheReadTokens,
    cacheCreationTokens,
    totalTokens,
  };
  const reasoningOutputTokens = tokenAlias(
    usage,
    "reasoningTokens",
    "reasoningOutputTokens",
  );
  const recordedCost =
    typeof usage.costUSD === "number" &&
    Number.isFinite(usage.costUSD) &&
    usage.costUSD >= 0
      ? usage.costUSD
      : null;
  // Missing counters are fine for display, but cannot establish a price.
  // Cache buckets are optional in DSH; without both, require an exact total
  // that the rate card can reconcile with the known buckets.
  const hasCacheEvidence =
    typeof usage.totalTokens === "number" ||
    (typeof usage.cacheReadTokens === "number" &&
      (typeof usage.cacheWriteTokens === "number" ||
        typeof usage.cacheCreationTokens === "number"));
  const estimate =
    recordedCost === null &&
    typeof usage.inputTokens === "number" &&
    typeof usage.outputTokens === "number" &&
    hasCacheEvidence &&
    reasoningOutputTokens <= outputTokens
      ? estimateDshRequest(model, counts, at)
      : null;
  const costUSD = recordedCost ?? estimate?.costUSD ?? null;
  return {
    totals: {
      ...counts,
      reasoningOutputTokens,
      costUSD: costUSD ?? 0,
      ...(costUSD === null && totalTokens > 0
        ? { unpricedModels: [model] }
        : {}),
    },
    rateCard: estimate?.card,
  };
}

/** Streaming, read-only projection. Conversation text is discarded per line. */
async function readSession(
  file: string,
  version: number,
  range: UsageRange | null,
  size?: number,
  budget?: TimingBudget,
) {
  const withTiming = range === null;
  let header: Row | undefined;
  let eventCount = 0;
  let boundarySeen = false;
  let activeModel: string | undefined;
  const seen = new Set<string>();
  let daily = new Map<string, UsagePeriod>();
  let totals = createEmptyTotals();
  const rateCards = new Set<DshRateCard>();
  let lastActivity: string | null = null;
  const models = new Set<string>();
  const steps = new Map<string, number>();
  const timing: TimingEvidence[] = [];
  function consume(line: string) {
    if (!line.trim()) return;
    const event = record(JSON.parse(line));
    if (!header) {
      if (
        event.type !== "session" ||
        event.version !== version ||
        !text(event.id)
      )
        throw new Error("会话头无效");
      if (
        typeof event.isSeeded !== "boolean" ||
        (event.seedLength !== undefined &&
          (!Number.isSafeInteger(event.seedLength) ||
            Number(event.seedLength) < 0))
      )
        throw new Error("继承历史边界无效");
      header = event;
      return;
    }
    eventCount++;
    const data = record(event.data);
    if (event.type === "session/end-seed" && data.inherited === true) {
      // Only TAGGED inherited cuts discard parent history. Ordinary untagged
      // restore/replay markers never discard this session's own usage.
      boundarySeen = true;
      daily = new Map();
      totals = createEmptyTotals();
      rateCards.clear();
      lastActivity = null;
      models.clear();
      seen.clear();
      steps.clear();
      timing.length = 0;
      return;
    }
    if (event.type === "model/selection") activeModel = text(data.model);
    if (
      Number.isSafeInteger(header.seedLength) &&
      eventCount <= Number(header.seedLength)
    )
      return;
    const step = withTiming ? dshStepKey(data) : undefined;
    if (
      withTiming &&
      (event.type === "turn/start" || event.type === "turn/end")
    )
      steps.clear();
    if (step !== undefined) {
      if (event.type === "step/start" || event.type === "llm/retry-started") {
        const start = logTime(event.time);
        if (start !== undefined) steps.set(step, start);
        else steps.delete(step);
      } else if (
        event.type === "assistant/attempt" ||
        event.type === "step/end"
      )
        steps.delete(step);
    }
    if (event.type !== "assistant/message") return;
    const message = record(data.message);
    const stepStart = step === undefined ? undefined : steps.get(step);
    if (step !== undefined) steps.delete(step);
    const source = record(message.source);
    const model = canonicalModelName(
      text(source.model) ?? text(data.model) ?? activeModel ?? "DSH / 未知模型",
    );
    const date =
      typeof event.time === "number" || typeof event.time === "string"
        ? new Date(event.time)
        : new Date(NaN);
    const request = usageFrom(data.usage ?? message.usage, model, date);
    if (!request || !request.totals.totalTokens) return;
    const usage = request.totals;
    if (!Number.isFinite(date.getTime())) throw new Error("用量时间无效");
    const label = range ? dateKey(date, range.timezone) : undefined;
    if (
      range &&
      label &&
      (label > range.end || (!range.allTime && label < range.start))
    )
      return;
    const identity =
      text(message.id) ??
      (Number.isSafeInteger(event.seq) ? `seq:${event.seq}` : undefined);
    if (!identity) throw new Error("用量消息缺少标识");
    if (seen.has(identity)) return;
    seen.add(identity);
    if (
      withTiming &&
      !data.interrupted &&
      usage.outputTokens > 0 &&
      model.length <= 256 &&
      identity.length <= 256 &&
      String(header.id).length <= 256
    ) {
      const at = date.getTime();
      timing.push({
        at,
        agent: "dsh",
        model,
        outputTokens: usage.outputTokens,
        identity: `dsh:${text(message.id) ?? String(header.id) + ":" + identity}`,
        ...dshRequestWindow(stepStart, at, data.stream),
      });
    }
    if (label === undefined) return;
    if (request.rateCard) rateCards.add(request.rateCard);
    const previous = daily.get(label);
    const previousModel =
      previous && Object.hasOwn(previous.models, model)
        ? previous.models[model]
        : undefined;
    daily.set(label, {
      ...(previous ? addUsageTotals(previous, usage) : usage),
      label,
      models: {
        ...previous?.models,
        [model]: {
          ...(previousModel ? addUsageTotals(previousModel, usage) : usage),
          ...(usage.unpricedModels?.length || previousModel?.missingPricing
            ? { missingPricing: true }
            : {}),
        },
      },
    });
    totals = addUsageTotals(totals, usage);
    models.add(model);
    const time = date.toISOString();
    if (!lastActivity || time > lastActivity) lastActivity = time;
  }
  const read = await scanJsonl(file, consume, size, 256 * 1024 * 1024, budget);
  // An uncommitted unterminated tail is not a complete persisted event.
  if (!header && budget && read.limited)
    return { id: "", daily: [], session: null, timing, read };
  if (!header) throw new Error("没有可读取的会话头");
  if (
    header.isSeeded === true &&
    !boundarySeen &&
    !Number.isSafeInteger(header.seedLength)
  )
    throw new Error("继承历史边界缺失");
  const session: UsageSession = {
    ...totals,
    ...(rateCards.size ? { dshRateCards: [...rateCards].sort() } : {}),
    id: `dsh:${header.id}`,
    source: "dsh",
    project: text(header.cwd) ?? null,
    lastActivity,
    models: [...models].sort(),
  };
  return {
    id: String(header.id),
    daily: [...daily.values()],
    session,
    timing,
    read,
  };
}

/** Scan only canonical session generations, never credentials, backups or plugins. */
async function listDshSessions(
  home: string,
  inventory?: ReturnType<typeof timingInventory>,
) {
  const files: { path: string; version: number }[] = [];
  const root = join(home, "sessions");
  let detected = false;
  let failed = 0;
  async function entriesAt(path: string, optional = false) {
    try {
      return inventory
        ? await inventory.children(path)
        : await readdir(/* turbopackIgnore: true */ path, {
            withFileTypes: true,
          });
    } catch (error) {
      if (!(optional && (error as NodeJS.ErrnoException).code === "ENOENT")) {
        failed++;
        detected = true;
      }
      return [];
    }
  }
  for (const project of await entriesAt(root, true)) {
    if (!project.isDirectory()) continue;
    const projectPath = join(root, project.name);
    for (const directory of await entriesAt(projectPath)) {
      if (!directory.isDirectory()) continue;
      const sessionPath = join(projectPath, directory.name);
      const generations = (await entriesAt(sessionPath))
        .flatMap((entry) => {
          const match = entry.isFile()
            ? /^session(?:\.v([1-9]\d*))?\.jsonl(\.zstd)?$/.exec(entry.name)
            : null;
          return match
            ? [
                {
                  name: entry.name,
                  version: Number(match[1] ?? 0),
                  compressed: Boolean(match[2]),
                },
              ]
            : [];
        })
        .sort(
          (a, b) =>
            b.version - a.version ||
            Number(a.compressed) - Number(b.compressed),
        );
      const current = generations[0];
      if (!current) continue;
      detected = true;
      if (current.version === 3 || current.version === 4)
        files.push({
          path: join(sessionPath, current.name),
          version: current.version,
        });
      else failed++;
    }
  }
  return { files, failed, detected };
}

export async function readDshUsage(
  range: UsageRange,
  home = process.env.DSH_HOME || join(homedir(), ".dsh"),
): Promise<DshReport> {
  const {
    files,
    failed: discoveryErrors,
    detected,
  } = await listDshSessions(home);
  let failed = discoveryErrors;
  const result: DshReport = { daily: [], sessions: [], warnings: [], detected };
  const visited = new Set<string>();
  for (const { path, version } of files) {
    try {
      const parsed = await readSession(path, version, range);
      if (visited.has(parsed.id)) continue;
      visited.add(parsed.id);
      result.daily = mergeUsagePeriods(result.daily, parsed.daily);
      if (parsed.session?.totalTokens) result.sessions.push(parsed.session);
    } catch {
      failed++;
    }
  }
  if (failed)
    result.warnings?.push(
      "DSH 有 " +
        failed +
        " 份会话或目录无法完整读取（格式、压缩或访问错误），当前统计可能不完整；原日志未改动。",
    );
  if (failed && !visited.size)
    result.error = "DSH 本机会话读取失败，请检查数据提示。";
  result.sessions.sort((a, b) =>
    (b.lastActivity ?? "").localeCompare(a.lastActivity ?? ""),
  );
  return result;
}

export async function readDshTiming(range: UsageRange, home: string) {
  const inventory = timingInventory();
  const discovered = await listDshSessions(home, inventory);
  // Discovery has already enforced the directory bound; trim obvious
  // out-of-range sessions without decoding them.
  const lower = range.allTime ? 0 : Date.parse(shiftDate(range.start, -1));
  let errors = discovered.failed;
  const files: (TimingFile & { version: number })[] = [];
  for (const { path, version } of discovered.files) {
    if (inventory.exhausted()) break;
    try {
      const file = await timingFile(path);
      if (file.modified >= lower) files.push({ ...file, version });
    } catch {
      errors++;
    }
  }
  files.sort((a, b) => b.modified - a.modified || a.path.localeCompare(b.path));
  return indexTimingFiles(
    "dsh",
    home,
    files,
    async ({ path, size, version }, budget) => {
      const { id, timing, read } = await readSession(
        path,
        version,
        null,
        size,
        budget,
      );
      return { ...read, session: id, samples: timing };
    },
    errors,
    inventory.truncated,
  );
}
