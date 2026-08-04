import { NextRequest, NextResponse } from "next/server";

import {
  normalizeDays,
  readUsageSnapshot,
  type UsageDeviceFilter,
  type UsageSource,
} from "@/lib/usage";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const source: UsageSource =
    searchParams.get("source") === "all" ? "all" : "codex";
  const days = normalizeDays(Number(searchParams.get("days")));
  const device: UsageDeviceFilter = searchParams.get("device") ?? "all";

  try {
    const snapshot = await readUsageSnapshot({ days, device, source });
    return NextResponse.json(snapshot, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    console.error("Unable to load ccusage data", error);

    return NextResponse.json(
      {
        error:
          "无法读取本地 ccusage 数据。请确认 Codex 日志存在，并且项目依赖已安装。",
      },
      { status: 500, headers: { "Cache-Control": "no-store" } }
    );
  }
}
