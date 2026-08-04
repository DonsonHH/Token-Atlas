export type UsageSource = "codex" | "all";
export type UsageDeviceFilter = "all" | "local" | string;

export type UsageDevice = {
  dailyEntries: number;
  id: string;
  kind: "imported" | "local";
  latestDate: string | null;
  name: string;
  updatedAt: string | null;
};

export type UsageTotals = {
  cacheCreationTokens: number;
  cacheReadTokens: number;
  costUSD: number;
  inputTokens: number;
  outputTokens: number;
  reasoningOutputTokens: number;
  totalTokens: number;
};

export type UsagePeriod = UsageTotals & {
  label: string;
  models: Record<string, UsageTotals & { isFallback?: boolean }>;
};

export type UsageSession = UsageTotals & {
  id: string;
  lastActivity: string | null;
  models: string[];
  project: string | null;
};

export type UsageModel = UsageTotals & {
  isFallback: boolean;
  name: string;
};

export type UsageSnapshot = {
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
  sessions: UsageSession[];
  source: UsageSource;
  totals: UsageTotals;
  weekly: UsagePeriod[];
  weeklyMethod: "ccusage" | "daily-derived";
};
