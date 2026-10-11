import { copyFile, mkdir, open, rename, stat, unlink } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { join } from "node:path";
import { NextRequest, NextResponse } from "next/server";
import {
  importLimit,
  validDeviceId,
  validateUsageImport,
} from "@/lib/usage-import-validation";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const origin = request.headers.get("origin");
  if (
    origin !== request.nextUrl.origin ||
    request.headers.get("sec-fetch-site") === "cross-site"
  ) {
    return NextResponse.json(
      { error: "仅允许从本机页面导入。" },
      { status: 403 },
    );
  }
  if (!request.headers.get("content-type")?.startsWith("application/json"))
    return NextResponse.json({ error: "需要 JSON 格式。" }, { status: 415 });
  let temporary: string | undefined;
  let lock: string | undefined;
  try {
    if (Number(request.headers.get("content-length")) > importLimit)
      throw new Error("文件最大 5 MB。");
    const reader = request.body?.getReader();
    if (!reader) throw new Error("没有导入内容。");
    const chunks: Uint8Array[] = [];
    let size = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > importLimit) {
        await reader.cancel();
        throw new Error("文件最大 5 MB。");
      }
      chunks.push(value);
    }
    const body = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    if (typeof body.id !== "string" || !validDeviceId(body.id))
      throw new Error(
        "设备编号只能包含小写字母、数字、短横线或下划线，且不能为 local / all。",
      );
    const report = validateUsageImport(
      body.report,
      typeof body.name === "string" ? body.name : "",
      body.source,
    );
    const directory = join(
      /*turbopackIgnore: true*/ process.cwd(),
      "data",
      "devices",
    );
    await mkdir(directory, { recursive: true });
    const target = join(directory, `${body.id}.json`);
    const lockPath = join(directory, `${body.id}.lock`);
    const handle = await open(/* turbopackIgnore: true */ lockPath, "wx").catch(
      () => {
        throw new Error("该设备正在导入，请稍后重试。");
      },
    );
    lock = lockPath;
    await handle.close();
    const existing = await stat(/* turbopackIgnore: true */ target).catch(
      () => null,
    );
    if (
      existing &&
      (!body.replace ||
        body.expectedModifiedAt !== existing.mtime.toISOString())
    ) {
      return NextResponse.json(
        { error: "设备已存在或数据已更新，请重新选择该设备后再导入。" },
        { status: 409 },
      );
    }
    temporary = join(directory, `${body.id}.${randomUUID()}.tmp`);
    const file = await open(/* turbopackIgnore: true */ temporary, "wx");
    try {
      await file.writeFile(JSON.stringify(report, null, 2), "utf8");
    } finally {
      await file.close();
    }
    if (existing)
      await copyFile(
        /* turbopackIgnore: true */ target,
        join(directory, `${body.id}.bak`),
      );
    await rename(/* turbopackIgnore: true */ temporary, target);
    temporary = undefined;
    return NextResponse.json({
      id: body.id,
      name: report.deviceName,
      days: report.daily.length,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof SyntaxError
            ? "JSON 格式不正确。"
            : error instanceof Error
              ? error.message
              : "导入失败。",
      },
      { status: 400 },
    );
  } finally {
    if (temporary)
      await unlink(/* turbopackIgnore: true */ temporary).catch(() => {});
    if (lock) await unlink(/* turbopackIgnore: true */ lock).catch(() => {});
  }
}
