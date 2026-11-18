import type {
  UsageDeviceFilter,
  UsageSession,
  UsageSnapshot,
  UsageSource,
} from "./usage-types";
import { dshPricingMetadata } from "./deepseek-pricing";
import { dshAstraPricingMetadata } from "./astra-pricing";
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
    "reader" | "activeDeviceIds" | "sessions" | "source" | "codexPricing"
  >,
  sessions?: UsageSession[],
) {
  const scope = sessions ? { ...snapshot, sessions } : snapshot;
  const codexPricing = scope.activeDeviceIds.includes("local")
    ? scope.codexPricing
    : undefined;
  const models = codexPricing?.models.filter(
    (model) =>
      !sessions ||
      sessions.some((session) =>
        hasPricedCodexModel(session, scope.source, model),
      ),
  );
  return {
    codexPricing:
      codexPricing && models?.length ? { ...codexPricing, models } : undefined,
    dshPricing: dshPricingMetadata(scope),
    dshAstraPricing: dshAstraPricingMetadata(scope),
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
