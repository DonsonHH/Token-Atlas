import { NextRequest, NextResponse } from "next/server";

import {
  normalizeDays,
  readUsageSnapshot,
  type UsageDeviceFilter,
  type UsageSource,
  usageSourceOptions,
} from "@/lib/usage";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function dateParameter(value: string | null): string | undefined {
  return value && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : undefined;
}

function lookbackDaysFor(startDate: string | undefined): number {
  if (!startDate) return 0;
  const start = Date.parse(`${startDate}T00:00:00Z`);
  if (!Number.isFinite(start)) return 0;
  const now = new Date();
  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  return Math.max(Math.floor((today - start) / 86_400_000) + 1, 0);
}

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const requestedSource = searchParams.get("source");
  const source: UsageSource = usageSourceOptions.some(
    (option) => option.value === requestedSource
  )
    ? (requestedSource as UsageSource)
    : "all";
  const device: UsageDeviceFilter = searchParams.get("device") ?? "all";
  const startDate = dateParameter(searchParams.get("start"));
  const endDate = dateParameter(searchParams.get("end"));
  const days = normalizeDays(
    Math.max(Number(searchParams.get("days")), lookbackDaysFor(startDate))
  );

  try {
    const snapshot = await readUsageSnapshot({
      days,
      device,
      endDate,
      source,
      startDate: startDate && (!endDate || startDate <= endDate) ? startDate : undefined,
    });
    return NextResponse.json(snapshot, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    console.error("Unable to load ccusage data", error);

    return NextResponse.json(
      {
        error:
          "无法读取本地 ccusage 数据。请确认至少一个受支持 Agent 的本地日志存在，并且项目依赖已安装。",
      },
      { status: 500, headers: { "Cache-Control": "no-store" } }
    );
  }
}
