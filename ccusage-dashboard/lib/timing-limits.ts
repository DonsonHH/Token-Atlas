export const TIMING_FILE_BYTES = 8 * 1024 * 1024;
export const TIMING_BATCH_BYTES = 24 * 1024 * 1024;
export const TIMING_BATCH_MS = 850;
export const TIMING_BATCH_FILES = 48;
export const TIMING_SCOPE_FILES = 128;
export const TIMING_FILE_SAMPLES = 256;
export const TIMING_INVENTORY_LIMIT = 8_000;
export const TIMING_INVENTORY_MS = 1_250;
export const TIMING_REPORT_TTL_MS = 15_000;

export type TimingBudget = { maxBytes: number; deadline: number };
export type TimingRead = {
  decodedBytes: number;
  limited: boolean;
  timedOut?: boolean;
};
