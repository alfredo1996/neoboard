import { z } from "zod";

/**
 * Runtime policy that an admin can change live (#2416). The keys are the env
 * variable names, so `SETTINGS_LOCKED=QUERY_MAX_CONCURRENT,LOG_LEVEL` reads the
 * way an operator thinks.
 *
 * Precedence: locked env > database > env > built-in default.
 *
 * This file has no database and no logger import, so the logger can read it.
 * The database side lives in `store.ts`.
 */

const positiveInt = (raw: string): number | undefined => {
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) && n > 0 ? n : undefined;
};
const ratio = (raw: string): number | undefined => {
  const n = Number.parseFloat(raw);
  return Number.isFinite(n) && n >= 0 && n <= 1 ? n : undefined;
};

export const LOG_LEVELS = [
  "fatal",
  "error",
  "warn",
  "info",
  "debug",
  "trace",
] as const;
type LogLevel = (typeof LOG_LEVELS)[number];

// `fromEnv` keeps today's lenient parse (an invalid env value falls back to
// the default); `schema` is the stricter range an admin's write must meet.
export const SETTINGS = {
  QUERY_MAX_CONCURRENT: {
    default: 10,
    fromEnv: positiveInt,
    schema: z.number().int().min(1).max(100),
  },
  QUERY_MAX_PER_USER: {
    default: 5,
    fromEnv: positiveInt,
    schema: z.number().int().min(1).max(100),
  },
  QUERY_MAX_QUEUE_DEPTH: {
    default: 200,
    fromEnv: positiveInt,
    schema: z.number().int().min(1).max(10_000),
  },
  QUERY_QUEUE_TIMEOUT_MS: {
    default: 15_000,
    fromEnv: positiveInt,
    schema: z.number().int().min(1000).max(120_000),
  },
  QUERY_SHED_THRESHOLD: {
    default: 0.8,
    fromEnv: ratio,
    schema: z.number().min(0.1).max(1),
  },
  // Closed by default: a deployment without an env file never ships open signup.
  REGISTRATION_ENABLED: {
    default: false,
    fromEnv: (raw: string): boolean => raw.toLowerCase() === "true",
    schema: z.boolean(),
  },
  LOG_LEVEL: {
    default: "info" as LogLevel,
    fromEnv: (raw: string): LogLevel | undefined => {
      const level = raw.toLowerCase();
      return LOG_LEVELS.find((l) => l === level);
    },
    schema: z.enum(LOG_LEVELS),
  },
} as const;

export type SettingKey = keyof typeof SETTINGS;
export type SettingValue<K extends SettingKey> = z.infer<
  (typeof SETTINGS)[K]["schema"]
>;
export type SettingSource = "locked" | "database" | "env" | "default";

export const SETTING_KEYS = Object.keys(SETTINGS) as SettingKey[];
const KEY_SET = new Set<string>(SETTING_KEYS);

export interface SettingRow {
  key: string;
  value: unknown;
  updatedBy: string | null;
  updatedByName?: string | null;
  updatedAt: Date | null;
}

// On globalThis for the reason the scheduler registry is (#1888): a production
// build gives instrumentation and each route its own copy of this module.
interface State {
  rows: Map<string, SettingRow>;
  listeners: Set<() => void>;
  timer?: ReturnType<typeof setInterval>;
}
const g = globalThis as typeof globalThis & { __neoboardSettings?: State };
export const state: State = (g.__neoboardSettings ??= {
  rows: new Map(),
  listeners: new Set(),
});

export const isSettingKey = (key: string): key is SettingKey =>
  KEY_SET.has(key);

function isLocked(key: SettingKey): boolean {
  return (process.env.SETTINGS_LOCKED ?? "")
    .split(",")
    .some((k) => k.trim() === key);
}

function envValue<K extends SettingKey>(key: K): SettingValue<K> | undefined {
  const raw = process.env[key];
  if (raw === undefined) return undefined;
  return SETTINGS[key].fromEnv(raw) as SettingValue<K> | undefined;
}

export interface SettingDescription<K extends SettingKey = SettingKey> {
  value: SettingValue<K>;
  source: SettingSource;
  /** What Reset returns to: the env value, else the built-in default. */
  base: { value: SettingValue<K>; source: "env" | "default" };
  updatedBy: string | null;
  updatedByName: string | null;
  updatedAt: string | null;
}

export function describeSetting<K extends SettingKey>(
  key: K,
): SettingDescription<K> {
  const def = SETTINGS[key];
  const env = envValue(key);
  const base =
    env === undefined
      ? { value: def.default as SettingValue<K>, source: "default" as const }
      : { value: env, source: "env" as const };
  const locked = isLocked(key);
  const row = state.rows.get(key);
  const parsed = row ? def.schema.safeParse(row.value) : null;
  const stored = !locked && parsed?.success ? row : undefined;
  let source: SettingSource = base.source;
  if (locked) source = "locked";
  else if (stored) source = "database";
  return {
    value: stored ? (parsed?.data as SettingValue<K>) : base.value,
    source,
    base,
    updatedBy: stored?.updatedBy ?? null,
    updatedByName: stored?.updatedByName ?? null,
    updatedAt: stored?.updatedAt?.toISOString() ?? null,
  };
}

/** Synchronous: reads the cache, never the database. Safe on a hot path. */
export function getSetting<K extends SettingKey>(key: K): SettingValue<K> {
  return describeSetting(key).value;
}

/**
 * Subscribe; returns the unsubscribe. A Set, not ids: every bundle copy of a
 * module registers its own listener and none may evict another (#1888).
 */
export function onSettingsChange(fn: () => void): () => void {
  state.listeners.add(fn);
  return () => void state.listeners.delete(fn);
}

const fingerprint = () =>
  JSON.stringify(SETTING_KEYS.map((k) => getSetting(k)));

/** Replace the cache with the database rows; listeners run when a value changed. */
export function applySettingRows(rows: SettingRow[]): void {
  const before = fingerprint();
  state.rows = new Map(rows.map((r) => [r.key, r]));
  if (fingerprint() === before) return;
  for (const fn of state.listeners) {
    try {
      fn();
    } catch {
      // A broken listener must not block the others or the write.
    }
  }
}

/**
 * Check a PUT body: `null` resets a key. Returns the first error, or null.
 * The per-user cap is checked against the values that would be in force.
 */
export function validateChanges(
  changes: Record<string, unknown>,
): string | null {
  for (const [key, value] of Object.entries(changes)) {
    if (!isSettingKey(key)) return `Unknown setting: ${key}`;
    if (isLocked(key)) return `${key} is locked by the deployment.`;
    if (value === null) continue;
    if (!SETTINGS[key].schema.safeParse(value).success) {
      return `${key}: value is out of range.`;
    }
  }
  const after = (
    key: "QUERY_MAX_CONCURRENT" | "QUERY_MAX_PER_USER",
  ): number => {
    const v = changes[key];
    if (v === null) return describeSetting(key).base.value;
    return typeof v === "number" ? v : getSetting(key);
  };
  // Only when a change touches either cap: env alone may be lenient, and that
  // must not make every unrelated save a 400.
  if (!("QUERY_MAX_PER_USER" in changes || "QUERY_MAX_CONCURRENT" in changes)) {
    return null;
  }
  if (after("QUERY_MAX_PER_USER") > after("QUERY_MAX_CONCURRENT")) {
    return "QUERY_MAX_PER_USER can't be more than max concurrent.";
  }
  return null;
}
