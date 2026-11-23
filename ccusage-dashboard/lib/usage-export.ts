import type {
  UsageDeviceFilter,
  UsageSession,
  UsageSnapshot,
  UsageSource,
} from "./usage-types";
import { dshPricingMetadata } from "./dsh-pricing";
import { hasPricedCodexModel } from "./usage-pricing";

export type UsageViewExport = Pick<
  UsageSnapshot,
  | "activeDeviceIds"
  | "range"
  | "readerVersion"
  | "reader"
  | "warnings"
  | "daily"
  | "generatedAt"
  | "models"
  | "monthly"
  | "totals"
  | "weekly"
> & {
  devices: UsageSnapshot["devices"];
  source: UsageSource;
} & Partial<ReturnType<typeof usagePricingMetadata>>;

export function usagePricingMetadata(
  snapshot: Pick<
    UsageSnapshot,
    "activeDeviceIds" | "sessions" | "source" | "codexPricing"
  >,
  sessions?: UsageSession[],
) {
  const scope = sessions ? { ...snapshot, sessions } : snapshot;
  let codexPricing;
  if (scope.codexPricing && scope.activeDeviceIds.includes("local")) {
    const { dailyModels, sessionModels, ...reference } = scope.codexPricing;
    const models = sessions
      ? sessionModels.filter((model) =>
          sessions.some((session) =>
            hasPricedCodexModel(session, scope.source, model),
          ),
        )
      : dailyModels;
    if (models.length) codexPricing = { ...reference, models };
  }
  return {
    codexPricing,
    ...dshPricingMetadata(scope),
  };
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
    reader: snapshot.reader,
    ...usagePricingMetadata(snapshot),
    // An external-only re-export must not claim the local reader repriced it.
    readerVersion:
      devices.length === 1
        ? devices[0].kind === "local"
          ? snapshot.readerVersion
          : devices[0].readerVersion
        : undefined,
    warnings: snapshot.warnings,
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
