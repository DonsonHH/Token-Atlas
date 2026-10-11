import { usageSourceOptions, type UsageSource } from "./usage-types";
import type { Grain, Metric } from "./usage-analytics";

export type WorkspacePage = "overview" | "analysis" | "sessions" | "sources";
export type WorkspaceState = {
  page: WorkspacePage;
  device: string;
  source: UsageSource;
  days: string;
  start?: string;
  end?: string;
  metric: Metric;
  grain: Grain;
  split: boolean;
};

export function workspaceState(query: URLSearchParams): WorkspaceState {
  const page = query.get("view");
  const metric = query.get("metric");
  const grain = query.get("grain");
  return {
    page:
      page === "analysis" || page === "sessions" || page === "sources"
        ? page
        : "overview",
    source:
      usageSourceOptions.find((item) => item.value === query.get("source"))
        ?.value ?? "all",
    device: query.get("device") ?? "all",
    days: query.get("days") ?? "14",
    start: query.get("start") ?? undefined,
    end: query.get("end") ?? undefined,
    metric:
      metric === "inputOutput" || metric === "cacheRead" || metric === "cost"
        ? metric
        : "tokens",
    grain: grain === "weekly" || grain === "monthly" ? grain : "daily",
    split: query.get("split") === "models",
  };
}

export function workspaceQuery(state: WorkspaceState): string {
  const query = new URLSearchParams({
    view: state.page,
    device: state.device,
    source: state.source,
    days: state.days,
  });
  if (state.start) query.set("start", state.start);
  if (state.end) query.set("end", state.end);
  if (state.metric !== "tokens") query.set("metric", state.metric);
  if (state.grain !== "daily") query.set("grain", state.grain);
  if (state.split) query.set("split", "models");
  return query.toString();
}
