import type {
  UsageDeviceFilter,
  UsageSnapshot,
  UsageSource,
} from "./usage-types";

export type UsageViewExport = Pick<
  UsageSnapshot,
  | "activeDeviceIds"
  | "range"
  | "warnings"
  | "daily"
  | "generatedAt"
  | "models"
  | "monthly"
  | "totals"
  | "weekly"
> & {
  devices: UsageSnapshot["devices"];
} & UsageExportOrigin;

type UsageExportOrigin = {
  source: UsageSource;
  reader?: UsageSnapshot["reader"];
  readerVersion?: string;
};

/** Attribute an export only to the device that contributed its data. */
export function usageExportOrigin(
  snapshot: Pick<
    UsageSnapshot,
    "activeDeviceIds" | "devices" | "reader" | "readerVersion" | "source"
  >,
  source = snapshot.source,
): UsageExportOrigin {
  if (snapshot.activeDeviceIds.length !== 1) return { source };
  const device = snapshot.devices.find(
    ({ id }) => id === snapshot.activeDeviceIds[0],
  );
  if (device?.kind === "imported") {
    return { source: device.source, readerVersion: device.readerVersion };
  }
  return device?.kind === "local"
    ? { source, reader: snapshot.reader, readerVersion: snapshot.readerVersion }
    : { source };
}

export function buildUsageViewExport(
  snapshot: UsageSnapshot,
  source: UsageSource,
): UsageViewExport {
  const devices = snapshot.devices.filter((device) =>
    snapshot.activeDeviceIds.includes(device.id),
  );

  return {
    range: snapshot.range,
    ...usageExportOrigin(snapshot, source),
    warnings: snapshot.warnings,
    activeDeviceIds: snapshot.activeDeviceIds,
    daily: snapshot.daily,
    devices,
    generatedAt: snapshot.generatedAt,
    models: snapshot.models,
    monthly: snapshot.monthly,
    totals: snapshot.totals,
    weekly: snapshot.weekly,
  };
}

export function usageExportFileName(
  prefix: string,
  scope: UsageDeviceFilter | UsageSource,
  generatedAt: string,
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
