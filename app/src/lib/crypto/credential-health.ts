import { sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { decrypt } from "./crypto";

/**
 * `ok` — a stored credential decrypted with the configured key.
 * `mismatch` — a credential exists and the key cannot decrypt it.
 * `no-credentials` — nothing encrypted yet; the key is unverified, not verified.
 * `unknown` — the probe itself could not run. Never let a diagnostic take down
 *   the endpoint an operator uses to find out why something is broken.
 */
export type CredentialDecryptionStatus =
  | "ok"
  | "mismatch"
  | "no-credentials"
  | "unknown";

/**
 * Does ENCRYPTION_KEY actually decrypt what is in this database?
 *
 * Every layer checks the key is well-FORMED — env-config validates 64 hex
 * chars and reports it `set`. Nothing checked it was the RIGHT key, so an
 * instance with a regenerated or mismatched key booted clean, passed health,
 * and then failed on every widget with Node's raw `Unsupported state or unable
 * to authenticate data` (#1274).
 *
 * `decrypt()` falls back to ENCRYPTION_KEY_OLD, so a half-completed rotation
 * reports `ok` — correctly: that is a supported state, and the credentials are
 * readable.
 *
 * One row, read-only. Returns a status and never the plaintext: the caller
 * needs one bit, and a decrypted connector credential has no business
 * travelling any further.
 */
export async function probeCredentialDecryption(): Promise<CredentialDecryptionStatus> {
  // A missing or malformed key is a configuration problem, already reported by
  // env-config at boot. Reporting it as "mismatch" would send the operator to
  // rotate a key that does not exist — the same misdiagnosis as calling
  // malformed ciphertext a key failure. Matches the CLI probe's behaviour.
  const key = process.env.ENCRYPTION_KEY;
  if (!key || key.length !== 64) return "unknown";

  try {
    const rows = await db.execute<{ configEncrypted: string }>(
      sql`SELECT "configEncrypted" FROM connection LIMIT 1`,
    );
    const ciphertext = rows[0]?.configEncrypted;
    if (!ciphertext) return "no-credentials";

    try {
      decrypt(ciphertext);
      return "ok";
    } catch {
      // GCM fails closed on a wrong key or tampered data, which is what makes
      // this conclusive rather than heuristic.
      return "mismatch";
    }
  } catch {
    // Unreachable database, missing table (pre-migration boot). Not a key
    // problem, and health already reports the db status separately.
    return "unknown";
  }
}
