import { NextRequest, NextResponse } from "next/server";
import { readNativePerformance } from "@/lib/native-performance";
import { readPerformanceOnce } from "@/lib/performance-read-service";
import { resolveUsageRange } from "@/lib/usage-range";
import { usageSourceOptions } from "@/lib/usage-types";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const loopback = /^(?:localhost|127\.0\.0\.1|\[::1\])(?::[0-9]{1,5})?$/i;
const headers = { "Cache-Control": "private, no-store" };

export async function GET(request: NextRequest) {
  const host = request.headers.get("host") ?? "";
  const origin = request.headers.get("origin");
  const forwardedHost = request.headers.get("x-forwarded-host");
  if (
    process.env.TOKEN_ATLAS_LOCAL_PERFORMANCE !== "1" ||
    process.env.TOKEN_ATLAS_DISABLE_PERFORMANCE === "1" ||
    !loopback.test(host) ||
    (forwardedHost !== null && forwardedHost !== host) ||
    request.headers.get("sec-fetch-site") === "cross-site" ||
    request.headers.get("x-token-atlas-performance") !== "1" ||
    (origin !== null && !["http://" + host, "https://" + host].includes(origin))
  )
    return NextResponse.json(
      { error: "请用新版一键启动或 pnpm dev 打开本机计时。" },
      { status: 403, headers },
    );

  const query = request.nextUrl.searchParams;
  const device = query.get("device") ?? "all";
  if (device !== "all" && device !== "local")
    return NextResponse.json(
      { error: "外部汇总没有请求计时。" },
      { status: 400, headers },
    );

  let range;
  try {
    range = resolveUsageRange({
      days:
        query.get("days") === "all" ? "all" : Number(query.get("days") ?? 14),
      start: query.get("start") ?? undefined,
      end: query.get("end") ?? undefined,
      timezone: query.get("timezone") ?? undefined,
    });
  } catch (cause) {
    return NextResponse.json(
      { error: cause instanceof Error ? cause.message : "日期范围无效。" },
      { status: 400, headers },
    );
  }
  const source = usageSourceOptions.find(
    ({ value }) => value === (query.get("source") ?? "all"),
  )?.value;
  if (!source)
    return NextResponse.json(
      { error: "Agent 来源无效。" },
      { status: 400, headers },
    );
  try {
    const key = JSON.stringify([
      source,
      range.start,
      range.end,
      range.allTime ?? false,
      range.timezone,
    ]);
    const work = readPerformanceOnce(key, () =>
      readNativePerformance(range, source),
    );
    if (!work)
      return NextResponse.json(
        { error: "正在读取另一个范围，计时会在下次刷新时更新。" },
        { status: 503, headers: { ...headers, "Retry-After": "2" } },
      );
    return NextResponse.json(await work, {
      headers,
    });
  } catch {
    return NextResponse.json(
      { error: "本机计时暂不可读，稍后会自动重试。" },
      { status: 503, headers },
    );
  }
}
