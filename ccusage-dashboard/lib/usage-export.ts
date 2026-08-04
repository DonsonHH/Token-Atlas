import type {
  UsageDeviceFilter,
  UsageSnapshot,
  UsageSource,
} from "./usage-types";

export type UsageViewExport = Pick<
  UsageSnapshot,
  | "activeDeviceIds"
  | "daily"
  | "generatedAt"
  | "models"
  | "monthly"
  | "totals"
  | "weekly"
> & {
  devices: UsageSnapshot["devices"];
  source: UsageSource;
};

export function buildUsageViewExport(
  snapshot: UsageSnapshot,
  source: UsageSource
): UsageViewExport {
  const devices = snapshot.devices.filter((device) =>
    snapshot.activeDeviceIds.includes(device.id)
  );

  return {
    activeDeviceIds: snapshot.activeDeviceIds,
    daily: snapshot.daily,
    devices,
    generatedAt: snapshot.generatedAt,
    models: snapshot.models,
    monthly: snapshot.monthly,
    source,
    totals: snapshot.totals,
    weekly: snapshot.weekly,
  };
}

export function usageExportFileName(
  prefix: string,
  scope: UsageDeviceFilter | UsageSource,
  generatedAt: string
): string {
  const safeScope =
    String(scope)
      .trim()
      .replace(/[^a-z0-9_-]+/gi, "-")
      .replace(/^-+|-+$/g, "") || "usage";
  const safeDate = /^\d{4}-\d{2}-\d{2}/.test(generatedAt)
    ? generatedAt.slice(0, 10)
    : new Date().toISOString().slice(0, 10);

  return [prefix, safeScope, safeDate].join("-") + ".json";
}
