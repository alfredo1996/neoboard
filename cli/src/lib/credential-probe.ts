import { createDecipheriv } from "node:crypto";
import { runFileOrNull, dockerExec } from "./exec.js";
import { readProjectConfig, getMode } from "./config.js";

/**
 * Does the configured ENCRYPTION_KEY actually decrypt what is in the database?
 *
 * Every layer checks the key is well-FORMED — env-config validates 64 hex
 * chars, /api/health reports it `set`, doctor never looked at it at all.
 * Nothing checked it was the RIGHT key. So an instance with a regenerated or
 * mismatched key booted clean, passed health, passed doctor, and then failed
 * on every widget with Node's raw `Unsupported state or unable to authenticate
 * data` — an error naming neither the key nor the fix (#1274).
 *
 * That is the failure mode most likely to hit during exactly the operations we
 * tell admins to perform: restoring a backup, migrating hosts, rotating
 * secrets, standing a second environment up against an existing database.
 *
 * One row, read-only, conclusive. Deliberately NOT a stored key fingerprint —
 * that would put a key-derived artifact at rest, which the direct-key design
 * avoids on purpose.
 */
export type ProbeOutcome =
  /** A stored credential decrypted with the configured key. */
  | "ok"
  /** A credential exists and the configured key cannot decrypt it. */
  | "mismatch"
  /** Nothing encrypted yet — the key is unverified, not verified. */
  | "no-credentials"
  /** Could not read the database. A different alarm, not a key problem. */
  | "unavailable";

export interface ProbeResult {
  outcome: ProbeOutcome;
}

/**
 * AES-256-GCM over `iv:authTag:ciphertext` (base64), key used directly —
 * mirrors app/src/lib/crypto/crypto.ts. Returns whether it decrypts, never
 * the plaintext: the caller needs one bit, and a decrypted connector
 * credential has no business existing in the CLI's memory.
 *
 * A format change would make this report a false mismatch, which is loud and
 * traceable — the failure direction to prefer over a false "ok".
 */
function decrypts(ciphertext: string, keyHex: string): boolean {
  try {
    const parts = ciphertext.split(":");
    if (parts.length !== 3) return false;
    const [ivB64, authTagB64, dataB64] = parts;
    const decipher = createDecipheriv(
      "aes-256-gcm",
      Buffer.from(keyHex, "hex"),
      Buffer.from(ivB64, "base64"),
    );
    decipher.setAuthTag(Buffer.from(authTagB64, "base64"));
    decipher.update(Buffer.from(dataB64, "base64"));
    decipher.final();
    return true;
  } catch {
    // Wrong key, tampered ciphertext, or malformed input. The auth tag failing
    // is the whole point — GCM fails closed, which is what makes this check
    // conclusive rather than heuristic.
    return false;
  }
}

/** Read one stored credential. Returns null when unreadable or absent. */
function readOneCiphertext(): string | null {
  const config = readProjectConfig();
  const { user, database } = config.postgres;
  // Same shell boundary the db commands use; user/database come from the
  // project config, which `config set` does not validate.
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(user)) return null;
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(database)) return null;

  const sql = `SELECT "configEncrypted" FROM connection LIMIT 1`;
  const out =
    getMode() === "docker"
      ? dockerExec(
          "neoboard-postgres",
          `psql -U ${user} -d ${database} -tAc '${sql}'`,
        )
      : // argv, not a shell string. The SQL contains a double-quoted
        // identifier, and interpolating it into a double-quoted command let
        // the shell strip those quotes AND split the statement across four
        // argv slots — so Postgres folded `configEncrypted` to lowercase, the
        // column did not exist, and the resulting null read as
        // "no-credentials". doctor reported that on every local-mode install.
        runFileOrNull("psql", [
          "-h",
          "localhost",
          "-p",
          String(config.ports.postgres),
          "-U",
          user,
          "-d",
          database,
          "-tAc",
          sql,
        ]);

  const value = out?.trim();
  return value ? value : null;
}

export async function probeCredentialDecryption(
  keyHex: string | undefined,
): Promise<ProbeResult> {
  // No key, or a malformed one, is already reported by `neoboard env
  // --validate` and by env-config at boot. Saying "mismatch" here would point
  // the operator at the wrong problem.
  if (!keyHex || keyHex.length !== 64) return { outcome: "unavailable" };

  let ciphertext: string | null;
  try {
    ciphertext = readOneCiphertext();
  } catch {
    return { outcome: "unavailable" };
  }
  if (ciphertext === null) return { outcome: "no-credentials" };

  return { outcome: decrypts(ciphertext, keyHex) ? "ok" : "mismatch" };
}
