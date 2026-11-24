import { createReadStream } from "node:fs";
import { open } from "node:fs/promises";
import { finished } from "node:stream/promises";
import { StringDecoder } from "node:string_decoder";
import type { Transform } from "node:stream";
import * as zlib from "node:zlib";
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
  bytes: number,
  budget: TimingBudget,
): Promise<TimingRead> {
  const stopped = Symbol("timing limit");
  let decoded = 0;
  let limited = false;
  let timedOut = false;
  const finish = (): TimingRead => ({
    decodedBytes: decoded,
    limited,
    ...(timedOut ? { timedOut } : {}),
  });
  if (!bytes) return finish();
  if (Date.now() >= budget.deadline)
    return { decodedBytes: 0, limited: true, timedOut: true };
  if (budget.maxBytes <= 0) return { decodedBytes: 0, limited: true };
  const compressed = /\.zst(?:d)?$/.test(file);
  const createNative = (
    zlib as typeof zlib & {
      createZstdDecompress?: (opts?: {
        chunkSize?: number;
        params?: Record<number, number>;
      }) => ZstdDecoder;
    }
  ).createZstdDecompress;
  // Skip compressed timing on runtimes that cannot bound the decoder window.
  const windowParam = (zlib.constants as unknown as Record<string, number>)
    .ZSTD_d_windowLogMax;
  if (compressed && (!createNative || windowParam === undefined))
    return { decodedBytes: 0, limited: true };
  const inputEnd = compressed ? Math.min(bytes, budget.maxBytes) : bytes;
  let inputStart = 0;
  if (!compressed && bytes > budget.maxBytes) {
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
    highWaterMark: 64 * 1024,
  });
  let tail = "";
  let discard = inputStart > 0;
  const maxLine = 1024 * 1024;
  const utf8 = new StringDecoder("utf8");
  function checkDeadline() {
    if (Date.now() >= budget.deadline) {
      limited = true;
      timedOut = true;
      throw stopped;
    }
  }
  function accept(chunk: Buffer) {
    checkDeadline();
    const exhausted = chunk.byteLength > budget.maxBytes - decoded;
    if (exhausted) chunk = chunk.subarray(0, budget.maxBytes - decoded);
    decoded += chunk.byteLength;
    const text = tail + utf8.write(chunk);
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
        limited = true;
      } else consume(text.slice(start, end));
      start = end + 1;
    }
    tail = text.slice(start);
    if (tail.length > maxLine) {
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
    if (compressed && createNative) {
      await readBoundedZstd(
        input,
        () =>
          createNative({ chunkSize: 64 * 1024, params: { [windowParam]: 24 } }),
        accept,
        checkDeadline,
      );
    } else {
      for await (const chunk of input) accept(chunk);
    }
  } catch (error) {
    if (
      error !== stopped &&
      !(
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
