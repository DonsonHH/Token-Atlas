import type { UsageRange } from "./usage-range";

export const usageSourceOptions = [
  { command: null, label: "全部已识别来源", value: "all" },
  { command: "claude", label: "Claude Code", value: "claude" },
  { command: "codex", label: "OpenAI Codex", value: "codex" },
  { command: "opencode", label: "OpenCode", value: "opencode" },
  { command: "amp", label: "Amp", value: "amp" },
  { command: "droid", label: "Droid", value: "droid" },
  { command: "codebuff", label: "Codebuff", value: "codebuff" },
  { command: "hermes", label: "Hermes Agent", value: "hermes" },
  { command: "pi", label: "pi-agent", value: "pi" },
  { command: "goose", label: "Goose", value: "goose" },
  { command: "openclaw", label: "OpenClaw", value: "openclaw" },
  { command: "kilo", label: "Kilo", value: "kilo" },
  { command: "kimi", label: "Kimi", value: "kimi" },
  { command: "qwen", label: "Qwen", value: "qwen" },
  { command: "copilot", label: "GitHub Copilot CLI", value: "copilot" },
  { command: "gemini", label: "Gemini CLI", value: "gemini" },
  { command: "antigravity", label: "Antigravity", value: "antigravity" },
  { command: "grok", label: "Grok Build CLI", value: "grok" },
  { command: "zcode", label: "ZCode", value: "zcode" },
] as const;

export type UsageSource = (typeof usageSourceOptions)[number]["value"];

export function usageSourceLabel(source: UsageSource) {
  return (
    usageSourceOptions.find((option) => option.value === source)?.label ??
    source
  );
}
export type UsageDeviceFilter = "all" | "local" | string;

export type UsageDevice = {
  dailyEntries: number;
  id: string;
  kind: "imported" | "local";
  latestDate: string | null;
  name: string;
  source: UsageSource;
  updatedAt: string | null;
  importedAt?: string | null;
  exportedAt?: string | null;
  readerVersion?: string;
  status?: "ready" | "error" | "idle";
  rangeTokens?: number;
  rangeDays?: number;
};

export type UsageTotals = {
  cacheCreationTokens: number;
  cacheReadTokens: number;
  costUSD: number;
  inputTokens: number;
  outputTokens: number;
  reasoningOutputTokens: number;
  totalTokens: number;
  unpricedModels?: string[];
  pricingUnknown?: boolean;
};

export type UsagePeriod = UsageTotals & {
  label: string;
  models: Record<
    string,
    UsageTotals & { isFallback?: boolean; missingPricing?: boolean }
  >;
};

export type UsageSession = UsageTotals & {
  id: string;
  lastActivity: string | null;
  models: string[];
  project: string | null;
  source?: UsageSource;
};

export type UsageModel = UsageTotals & {
  isFallback: boolean;
  missingPricing?: boolean;
  name: string;
};

export type UsageSnapshot = {
  range: UsageRange;
  warnings: string[];
  sessionStatus: "ready" | "unavailable" | "aggregate-only";
  activeDeviceIds: string[];
  daily: UsagePeriod[];
  dataPath: string;
  devices: UsageDevice[];
  generatedAt: string;
  mode: "live";
  models: UsageModel[];
  monthly: UsagePeriod[];
  offline: true;
  raw: Record<string, unknown>;
  reader: "ccusage";
  readerVersion?: string;
  sessions: UsageSession[];
  source: UsageSource;
  totals: UsageTotals;
  weekly: UsagePeriod[];
  weeklyMethod: "ccusage" | "daily-derived";
};
