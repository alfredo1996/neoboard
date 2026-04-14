import { createHmac } from "node:crypto";

/**
 * Log anonymization — hashes PII and redacts sensitive fields so
 * operators can ship logs to shared observability systems without
 * exposing user identities.
 *
 * Applied at the pino `hooks.logMethod` layer when LOG_ANONYMIZE=true,
 * so every log call across the app runs through this without needing
 * per-call-site awareness.
 *
 * The hash is keyed with a static secret so that the same userId always
 * produces the same hash across a deployment (enabling correlation of
 * multiple events from the same user without revealing their identity).
 * The secret is intentionally NOT configurable via env — using a
 * different secret per deployment would fragment correlation across
 * replicas. If operators need fully irreversible hashing they can rotate
 * by redeploying with a new constant; the secret is not a security
 * boundary (the log record is what an adversary would be trying to
 * un-anonymize, and they would need access to it to do so).
 */

const HMAC_SECRET = "neoboard-log-anonymizer-v1";
const HASH_PREFIX = "sha256:";
const REDACTED = "[REDACTED]";

/**
 * Deterministic 16-hex-char hash, short enough to fit readable log
 * columns while preserving enough bits (64) for correlation across
 * millions of users without collisions.
 */
export function hashValue(value: string): string {
  return (
    HASH_PREFIX +
    createHmac("sha256", HMAC_SECRET).update(value).digest("hex").slice(0, 16)
  );
}

/**
 * Mask a connection URI by stripping credentials while preserving host,
 * port, and database so operators can still distinguish which data
 * source a log entry referred to. Falls back to a hash if the value
 * is not a parseable URL.
 */
export function maskUri(uri: string): string {
  try {
    const parsed = new URL(uri);
    parsed.username = "***";
    parsed.password = "";
    // URL.toString() renders "***:@" when the password is empty —
    // normalise to "***@" for cleaner logs.
    return parsed.toString().replace("***:@", "***@");
  } catch {
    return hashValue(uri);
  }
}

/** Keys whose string values should be one-way hashed when present. */
const HASH_KEYS = new Set(["userId", "user_id", "email"]);

/** Keys whose values should be replaced with [REDACTED] wholesale. */
const REDACT_KEYS = new Set(["params", "password", "passwordHash", "token"]);

/** Keys whose string values should be masked as a connection URI. */
const URI_KEYS = new Set(["uri", "connectionUri", "dbUri"]);

/**
 * Recursively anonymize a log record. Returns a new object — the
 * input is never mutated.
 *
 * - `HASH_KEYS` string values → `sha256:<hex>`
 * - `REDACT_KEYS` values → `[REDACTED]`
 * - `URI_KEYS` string values → credential-stripped URI
 * - Nested plain objects → recurse
 * - Arrays, primitives, Date, Error → passed through unchanged
 */
export function anonymizeLogRecord(
  input: Record<string, unknown>,
): Record<string, unknown> {
  const output: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(input)) {
    if (REDACT_KEYS.has(key)) {
      output[key] = REDACTED;
      continue;
    }
    if (HASH_KEYS.has(key) && typeof value === "string") {
      output[key] = hashValue(value);
      continue;
    }
    if (URI_KEYS.has(key) && typeof value === "string") {
      output[key] = maskUri(value);
      continue;
    }
    if (isPlainObject(value)) {
      output[key] = anonymizeLogRecord(value as Record<string, unknown>);
      continue;
    }
    output[key] = value;
  }
  return output;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== "object") return false;
  if (Array.isArray(value)) return false;
  if (value instanceof Date) return false;
  if (value instanceof Error) return false;
  // Keep anything with a custom prototype (e.g. class instances) opaque
  // so we don't accidentally mess with their toJSON methods.
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}
