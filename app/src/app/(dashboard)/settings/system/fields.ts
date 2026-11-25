/**
 * The System page's fields (#2416). The API speaks stored units (ms, a ratio);
 * the page speaks the units people think in (seconds, percent).
 */

export type NumberKey =
  | "QUERY_MAX_CONCURRENT"
  | "QUERY_MAX_PER_USER"
  | "QUERY_MAX_QUEUE_DEPTH"
  | "QUERY_QUEUE_TIMEOUT_MS"
  | "QUERY_SHED_THRESHOLD";

export interface NumberField {
  label: string;
  help: string;
  min: number;
  max: number;
  /** Shown beside the input. */
  unit?: string;
  /** stored = shown * factor. */
  factor: number;
}

export const NUMBER_FIELDS: Record<NumberKey, NumberField> = {
  QUERY_MAX_CONCURRENT: {
    label: "Max concurrent",
    help: "Queries one connection runs at the same time.",
    min: 1,
    max: 100,
    factor: 1,
  },
  QUERY_MAX_PER_USER: {
    label: "Max per user",
    help: "Queries one person runs at the same time on one connection.",
    min: 1,
    max: 100,
    factor: 1,
  },
  QUERY_MAX_QUEUE_DEPTH: {
    label: "Queue depth",
    help: "Queries that can wait. Past this, new ones are refused until the queue drains.",
    min: 1,
    max: 10_000,
    factor: 1,
  },
  QUERY_QUEUE_TIMEOUT_MS: {
    label: "Queue timeout",
    help: "How long a query waits in the queue before it gives up.",
    min: 1,
    max: 120,
    unit: "seconds",
    factor: 1000,
  },
  QUERY_SHED_THRESHOLD: {
    label: "Shed threshold",
    help: "How full the queue gets before background refreshes are dropped.",
    min: 10,
    max: 100,
    unit: "percent full",
    factor: 0.01,
  },
};

export const SCHEDULER_KEYS = Object.keys(NUMBER_FIELDS) as NumberKey[];
export const LEVELS = ["fatal", "error", "warn", "info", "debug", "trace"];

const round = (n: number) => Math.round(n * 1e6) / 1e6;
export const toShown = (key: NumberKey, stored: number): number =>
  round(stored / NUMBER_FIELDS[key].factor);
export const toStored = (key: NumberKey, shown: number): number =>
  round(shown * NUMBER_FIELDS[key].factor);

/** The inline error for a typed value, or "". `concurrent` bounds Max per user. */
export function numberError(
  key: NumberKey,
  raw: string,
  concurrent: string,
): string {
  const { min, max } = NUMBER_FIELDS[key];
  const n = Number(raw);
  if (raw.trim() === "" || !Number.isInteger(n)) return "Enter a whole number.";
  if (n < min || n > max) {
    return `Enter a number from ${min} to ${max.toLocaleString("en")}.`;
  }
  if (key === "QUERY_MAX_PER_USER" && n > Number(concurrent)) {
    return `Can't be more than Max concurrent (${concurrent}).`;
  }
  return "";
}

export interface Described {
  value: number | boolean | string;
  source: "locked" | "database" | "env" | "default";
  base: { value: number | boolean | string; source: "env" | "default" };
  updatedByName: string | null;
  updatedAt: string | null;
}

export interface SystemData {
  settings: Record<string, Described>;
  sessionMaxAge: { seconds: number; source: "env" | "default" };
}

export const SOURCE_LABEL = {
  locked: "Locked",
  database: "Set here",
  env: "From env",
  default: "Default",
} as const;

/** "8 hours", "90 minutes", "45 seconds". */
export function formatDuration(seconds: number): string {
  for (const [size, name] of [
    [3600, "hour"],
    [60, "minute"],
  ] as const) {
    if (seconds % size === 0) {
      const n = seconds / size;
      return `${n} ${name}${n === 1 ? "" : "s"}`;
    }
  }
  return `${seconds} seconds`;
}
