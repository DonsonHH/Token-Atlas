import { NextRequest, NextResponse } from "next/server";
import { readUsageSnapshot } from "@/lib/usage";
import { resolveUsageRange } from "@/lib/usage-range";
import { usageSourceOptions } from "@/lib/usage-types";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const query = request.nextUrl.searchParams;
  try {
    const source = usageSourceOptions.find(
      (option) => option.value === (query.get("source") ?? "all"),
    )?.value;
    if (!source) throw new Error("Agent 来源无效。");
    const range = resolveUsageRange({
      days:
        query.get("days") === "all"
          ? "all"
          : query.has("days")
            ? Number(query.get("days"))
            : 14,
      start: query.get("start") ?? undefined,
      end: query.get("end") ?? undefined,
      timezone: query.get("timezone") ?? undefined,
    });
    const snapshot = await readUsageSnapshot({
      range,
      device: query.get("device") ?? "all",
      source,
    });
    return NextResponse.json(snapshot, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "读取失败，请重试。" },
      {
        status: 400,
        headers: { "Cache-Control": "no-store" },
      },
    );
  }
}
