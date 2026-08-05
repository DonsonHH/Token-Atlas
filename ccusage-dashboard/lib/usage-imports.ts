import {
  existsSync,
  readdirSync,
  readFileSync,
  statSync,
} from "node:fs";
import type { Dirent } from "node:fs";
import { join } from "node:path";

import {
  deviceNameFromFile,
  latestUsageLabel,
  usagePeriodsFrom,
} from "./usage-domain";
import {
  usageSourceOptions,
  type UsageDevice,
  type UsagePeriod,
  type UsageSource,
} from "./usage-types";

type ImportedUsage = {
  dailyByDevice: Record<string, UsagePeriod[]>;
  devices: UsageDevice[];
  raw: Record<string, unknown>;
};

function metadataString(
  metadata: Record<string, unknown>,
  key: string
): string | null {
  const value = metadata[key];
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

export function readImportedUsage(rootDirectory = process.cwd()): ImportedUsage {
  const directory = join(rootDirectory, "data", "devices");
  if (!existsSync(directory)) {
    return { dailyByDevice: {}, devices: [], raw: {} };
  }

  let entries: Dirent[];
  try {
    entries = readdirSync(directory, { withFileTypes: true });
  } catch (error) {
    console.warn("Unable to read imported usage directory", error);
    return { dailyByDevice: {}, devices: [], raw: {} };
  }

  const dailyByDevice: Record<string, UsagePeriod[]> = {};
  const devices: UsageDevice[] = [];
  const raw: Record<string, unknown> = {};

  for (const entry of entries) {
    if (!entry.isFile() || !/\.json$/i.test(entry.name)) continue;

    try {
      const filePath = join(directory, entry.name);
      const report = JSON.parse(readFileSync(filePath, "utf8")) as unknown;
      const deviceDaily = usagePeriodsFrom(report, "daily");
      if (!deviceDaily.length) {
        console.warn("Skipping usage import without daily entries: " + entry.name);
        continue;
      }

      const metadata =
        typeof report === "object" && report !== null && !Array.isArray(report)
          ? (report as Record<string, unknown>)
          : {};
      const id = entry.name.replace(/\.json$/i, "");
      const requestedSource = metadataString(metadata, "source");
      const source: UsageSource = usageSourceOptions.some(
        (option) => option.value === requestedSource
      )
        ? (requestedSource as UsageSource)
        : "codex";
      dailyByDevice[id] = deviceDaily;
      devices.push({
        dailyEntries: deviceDaily.length,
        id,
        kind: "imported",
        latestDate: latestUsageLabel(deviceDaily),
        name: metadataString(metadata, "deviceName") ?? deviceNameFromFile(entry.name),
        source,
        updatedAt:
          metadataString(metadata, "exportedAt") ??
          metadataString(metadata, "generatedAt") ??
          statSync(filePath).mtime.toISOString(),
      });
      raw[id] = report;
    } catch (error) {
      console.warn("Skipping invalid usage import: " + entry.name, error);
    }
  }

  return { dailyByDevice, devices, raw };
}
