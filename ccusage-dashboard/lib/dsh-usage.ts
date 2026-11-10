import { createReadStream } from "node:fs";
import { readdir, stat } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { StringDecoder } from "node:string_decoder";
import { Decompress } from "fzstd";
import {
  addUsageTotals,
  createEmptyTotals,
  mergeUsagePeriods,
} from "./usage-domain";
import { dateKey, type UsageRange } from "./usage-range";
import { deepseekReferenceCostUSD } from "./deepseek-pricing";
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
): UsageTotals | null {
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
  const recordedCost =
    typeof usage.costUSD === "number" &&
    Number.isFinite(usage.costUSD) &&
    usage.costUSD >= 0;
  const officialCost = recordedCost
    ? null
    : deepseekReferenceCostUSD(
        model,
        { inputTokens, outputTokens, cacheReadTokens, cacheCreationTokens },
        at,
      );
  const costUSD = recordedCost ? (usage.costUSD as number) : officialCost;
  return {
    inputTokens,
    outputTokens,
    cacheReadTokens,
    cacheCreationTokens,
    totalTokens,
    reasoningOutputTokens: tokenAlias(
      usage,
      "reasoningTokens",
      "reasoningOutputTokens",
    ),
    costUSD: costUSD ?? 0,
    ...(costUSD === null && totalTokens > 0 ? { unpricedModels: [model] } : {}),
  };
}

/** Streaming, read-only projection. Conversation text is discarded per line. */
async function readSession(file: string, version: number, range: UsageRange) {
  let header: Row | undefined;
  let eventCount = 0;
  let boundarySeen = false;
  let activeModel: string | undefined;
  const seen = new Set<string>();
  let daily = new Map<string, UsagePeriod>();
  let totals = createEmptyTotals();
  let lastActivity: string | null = null;
  const models = new Set<string>();
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
      lastActivity = null;
      models.clear();
      seen.clear();
      return;
    }
    if (event.type === "model/selection") activeModel = text(data.model);
    if (
      Number.isSafeInteger(header.seedLength) &&
      eventCount <= Number(header.seedLength)
    )
      return;
    if (event.type !== "assistant/message") return;
    const message = record(data.message);
    const source = record(message.source);
    const model =
      text(source.model) ?? text(data.model) ?? activeModel ?? "DSH / 未知模型";
    const date =
      typeof event.time === "number" || typeof event.time === "string"
        ? new Date(event.time)
        : new Date(NaN);
    const usage = usageFrom(data.usage ?? message.usage, model, date);
    if (!usage || !usage.totalTokens) return;
    if (!Number.isFinite(date.getTime())) throw new Error("用量时间无效");
    const label = dateKey(date, range.timezone);
    if (label > range.end || (!range.allTime && label < range.start)) return;
    const identity =
      text(message.id) ??
      (Number.isSafeInteger(event.seq) ? `seq:${event.seq}` : undefined);
    if (!identity) throw new Error("用量消息缺少标识");
    if (seen.has(identity)) return;
    seen.add(identity);
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
  let pending = "";
  let decodedBytes = 0;
  const decoder = new StringDecoder("utf8");
  function accept(bytes: Uint8Array) {
    decodedBytes += bytes.length;
    if (decodedBytes > 256 * 1024 * 1024) throw new Error("会话超过读取上限");
    pending += decoder.write(Buffer.from(bytes));
    let end: number;
    while ((end = pending.indexOf("\n")) !== -1) {
      consume(pending.slice(0, end));
      pending = pending.slice(end + 1);
    }
    if (pending.length > 16 * 1024 * 1024)
      throw new Error("单条记录超过读取上限");
  }
  const size = (await stat(/* turbopackIgnore: true */ file)).size;
  const decompressor = file.endsWith(".zstd")
    ? new Decompress(accept)
    : undefined;
  if (size) {
    const stream = createReadStream(/* turbopackIgnore: true */ file, {
      end: size - 1,
      highWaterMark: 64 * 1024,
    });
    for await (const chunk of stream) {
      if (decompressor) decompressor.push(chunk);
      else accept(chunk);
    }
    decompressor?.push(new Uint8Array(), true);
  }
  // An uncommitted unterminated tail is not a complete persisted event.
  if (!header) throw new Error("没有可读取的会话头");
  if (
    header.isSeeded === true &&
    !boundarySeen &&
    !Number.isSafeInteger(header.seedLength)
  )
    throw new Error("继承历史边界缺失");
  const session: UsageSession = {
    ...totals,
    id: `dsh:${header.id}`,
    source: "dsh",
    project: text(header.cwd) ?? null,
    lastActivity,
    models: [...models].sort(),
  };
  return { id: String(header.id), daily: [...daily.values()], session };
}

/** Scan only canonical session generations, never credentials, backups or plugins. */
export async function readDshUsage(
  range: UsageRange,
  home = process.env.DSH_HOME || join(homedir(), ".dsh"),
): Promise<DshReport> {
  const result: DshReport = {
    daily: [],
    sessions: [],
    warnings: [],
    detected: false,
  };
  const root = join(home, "sessions");
  const visited = new Set<string>();
  let failed = 0;
  async function entriesAt(path: string) {
    try {
      return await readdir(/* turbopackIgnore: true */ path, {
        withFileTypes: true,
      });
    } catch {
      result.detected = true;
      failed++;
      return [];
    }
  }
  try {
    const projects = await readdir(/* turbopackIgnore: true */ root, {
      withFileTypes: true,
    });
    for (const project of projects.filter((entry) => entry.isDirectory())) {
      const projectPath = join(root, project.name);
      const sessions = await entriesAt(projectPath);
      for (const directory of sessions.filter((entry) => entry.isDirectory())) {
        const sessionPath = join(projectPath, directory.name);
        const entries = await entriesAt(sessionPath);
        const generations = entries
          .filter((entry) => entry.isFile())
          .flatMap((entry) => {
            const match = /^session(?:\.v([1-9]\d*))?\.jsonl(\.zstd)?$/.exec(
              entry.name,
            );
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
        if (!generations.length) continue;
        result.detected = true;
        const current = generations[0];
        try {
          if (current.version !== 3 && current.version !== 4)
            throw new Error("尚未支持的格式版本");
          const parsed = await readSession(
            join(sessionPath, current.name),
            current.version,
            range,
          );
          if (visited.has(parsed.id)) continue;
          visited.add(parsed.id);
          result.daily = mergeUsagePeriods(result.daily, parsed.daily);
          if (parsed.session.totalTokens) result.sessions.push(parsed.session);
        } catch {
          failed++;
        }
      }
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
      result.detected = true;
      failed++;
    }
  }
  if (failed)
    result.warnings?.push(
      `DSH 有 ${failed} 份会话或目录无法完整读取（格式、压缩或访问错误），当前统计可能不完整；原日志未改动。`,
    );
  if (failed && !visited.size)
    result.error = "DSH 本机会话读取失败，请检查数据提示。";
  result.sessions.sort((a, b) =>
    (b.lastActivity ?? "").localeCompare(a.lastActivity ?? ""),
  );
  return result;
}
