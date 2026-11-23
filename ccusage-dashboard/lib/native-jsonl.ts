import { createReadStream } from "node:fs";
import { open, stat } from "node:fs/promises";
import { finished } from "node:stream/promises";
import { StringDecoder } from "node:string_decoder";
import type { Transform } from "node:stream";
import * as zlib from "node:zlib";
import { Decompress } from "fzstd";
import type { TimingBudget, TimingRead } from "./timing-limits";

export type LogRecord = Record<string, unknown>;
export const logRecord = (value: unknown): LogRecord =>
  value && typeof value === "object" && !Array.isArray(value)
    ? (value as LogRecord)
    : {};
export function logText(value: unknown) {
  if (typeof value !== "string" || value.length > 256) return;
  return value.trim() || undefined;
}
export const logCount = (value: unknown): number | undefined =>
  typeof value === "number" && Number.isSafeInteger(value) && value >= 0
    ? value
    : undefined;
export const logTime = (value: unknown) => {
  const ms = typeof value === "string" ? Date.parse(value) : logCount(value);
  // Only UTC instants representable by Date can enter the timing report.
  return ms !== undefined && Number.isFinite(ms) && Math.abs(ms) <= 8.64e15
    ? ms
    : undefined;
};

type ZstdDecoder = Transform & { readonly bytesWritten: number };

async function readBoundedZstd(
  source: AsyncIterable<Buffer>,
  create: () => ZstdDecoder,
  consume: (chunk: Buffer) => void,
  checkDeadline: () => void,
) {
  let consumerFailure: { reason: unknown } | undefined;
  function openDecoder() {
    const stream = create();
    const done = finished(stream, { cleanup: true });
    void done.catch(() => {});
    stream.on("data", (chunk: Buffer) => {
      try {
        consume(chunk);
      } catch (reason) {
        consumerFailure = { reason };
        stream.destroy(new Error("Timing decode stopped", { cause: reason }));
      }
    });
    return { stream, done };
  }

  let decoder = openDecoder();
  try {
    for await (const chunk of source) {
      let offset = 0;
      while (offset < chunk.length) {
        // A skippable or empty frame can consume input without calling accept.
        checkDeadline();
        const { stream, done } = decoder;
        const before = stream.bytesWritten;
        await Promise.race([
          done,
          new Promise<void>((resolve, reject) => {
            stream.write(chunk.subarray(offset), (error) =>
              error ? reject(error) : resolve(),
            );
          }),
        ]);
        const consumed = stream.bytesWritten - before;
        if (consumed <= 0 || consumed > chunk.length - offset)
          throw new Error("Zstandard decoder did not advance");
        offset += consumed;
        if (offset < chunk.length) {
          // Node 22 may end a write at the first frame and discard its
          // suffix. Feed the untouched bytes to a fresh, still capped decoder.
          stream.end();
          await done;
          decoder = openDecoder();
        }
      }
    }
    decoder.stream.end();
    await decoder.done;
  } catch (error) {
    throw consumerFailure ? consumerFailure.reason : error;
  } finally {
    decoder.stream.destroy();
  }
}

/** Read only complete, newline-terminated records from a fixed file prefix. */
export async function scanJsonl(
  file: string,
  consume: (line: string) => void,
  size?: number,
  decodedLimit = 512 * 1024 * 1024,
  budget?: TimingBudget,
): Promise<TimingRead> {
  const bytes = size ?? (await stat(/* turbopackIgnore: true */ file)).size;
  const stopped = Symbol("timing limit");
  let decoded = 0;
  let limited = false;
  const finish = (): TimingRead => ({ decodedBytes: decoded, limited });
  if (!bytes) return finish();
  if (budget && (budget.maxBytes <= 0 || Date.now() >= budget.deadline))
    return { decodedBytes: 0, limited: true };
  const compressed = /\.zst(?:d)?$/.test(file);
  const createNative = (
    zlib as typeof zlib & {
      createZstdDecompress?: (opts?: {
        chunkSize?: number;
        params?: Record<number, number>;
      }) => ZstdDecoder;
    }
  ).createZstdDecompress;
  // Tight preview limits must carry through the decompressor's own window.
  // Older Node runtimes can still read compressed DSH usage via the original
  // fallback. The optional timing scan won't allocate an unchecked window.
  const windowParam = (zlib.constants as unknown as Record<string, number>)
    .ZSTD_d_windowLogMax;
  if (budget && compressed && (!createNative || windowParam === undefined))
    return { decodedBytes: 0, limited: true };
  const inputEnd =
    budget && compressed ? Math.min(bytes, budget.maxBytes) : bytes;
  let inputStart = 0;
  if (budget && !compressed && bytes > budget.maxBytes) {
    // Inspect the ownership header, then sample only a small tail. Every edit
    // to a growing rollout stays bounded, unlike rereading it from byte zero.
    limited = true;
    const fileHandle = await open(/* turbopackIgnore: true */ file, "r");
    try {
      const header = Buffer.alloc(
        Math.min(64 * 1024, Math.floor(budget.maxBytes / 8)),
      );
      const { bytesRead } = await fileHandle.read(header, 0, header.length, 0);
      decoded = bytesRead;
      const end = header.subarray(0, bytesRead).indexOf(10);
      if (end < 0) return finish();
      consume(header.toString("utf8", 0, end));
      inputStart = bytes - (budget.maxBytes - decoded);
    } finally {
      await fileHandle.close();
    }
  }
  limited ||= inputEnd < bytes;
  const input = createReadStream(/* turbopackIgnore: true */ file, {
    start: inputStart,
    end: inputEnd - 1,
    highWaterMark: budget ? 64 * 1024 : 128 * 1024,
  });
  let tail = "";
  let discard = inputStart > 0;
  const maxLine = (budget ? 1 : 16) * 1024 * 1024;
  const utf8 = new StringDecoder("utf8");
  function checkDeadline() {
    if (budget && Date.now() >= budget.deadline) {
      limited = true;
      throw stopped;
    }
  }
  function accept(chunk: Uint8Array) {
    checkDeadline();
    const exhausted =
      budget !== undefined && chunk.byteLength > budget.maxBytes - decoded;
    if (budget && exhausted)
      chunk = chunk.subarray(0, budget.maxBytes - decoded);
    decoded += chunk.byteLength;
    if (decoded > decodedLimit) throw new Error("日志超过单次解析上限");
    const text =
      tail + utf8.write(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    let start = 0;
    if (discard) {
      const boundary = text.indexOf("\n");
      if (boundary < 0) {
        if (exhausted) {
          limited = true;
          throw stopped;
        }
        return;
      }
      start = boundary + 1;
      discard = false;
    }
    for (
      let end = text.indexOf("\n", start);
      end !== -1;
      end = text.indexOf("\n", start)
    ) {
      checkDeadline();
      if (end - start > maxLine) {
        if (!budget) throw new Error("日志单行过长");
        limited = true;
      } else consume(text.slice(start, end));
      start = end + 1;
    }
    tail = text.slice(start);
    if (tail.length > maxLine) {
      if (!budget) throw new Error("日志单行过长");
      limited = true;
      discard = true;
      tail = "";
    }
    if (exhausted) {
      limited = true;
      throw stopped;
    }
  }
  try {
    if (compressed && budget && createNative) {
      await readBoundedZstd(
        input,
        () =>
          createNative({ chunkSize: 64 * 1024, params: { [windowParam]: 24 } }),
        accept,
        checkDeadline,
      );
    } else {
      // Keep the original multi-frame DSH usage path independent of the
      // version or experimental availability of Node's native Zstd decoder.
      const fallback = compressed ? new Decompress(accept) : undefined;
      for await (const chunk of input) {
        if (fallback) fallback.push(chunk);
        else accept(chunk);
      }
      fallback?.push(new Uint8Array(), true);
    }
  } catch (error) {
    if (
      error !== stopped &&
      !(
        budget &&
        inputEnd < bytes &&
        (error as NodeJS.ErrnoException).code === "Z_BUF_ERROR"
      )
    )
      throw error;
  } finally {
    input.destroy();
  }
  return finish();
}
