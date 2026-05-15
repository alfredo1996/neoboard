import { createCipheriv, createDecipheriv, randomBytes } from "crypto";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12;

function getKey(): Buffer {
  const hex = process.env.ENCRYPTION_KEY;
  if (!hex || hex.length !== 64) {
    throw new Error(
      "ENCRYPTION_KEY must be a 64-character hex string (32 bytes)",
    );
  }
  return Buffer.from(hex, "hex");
}

/**
 * Returns the previous encryption key for key rotation, or null if not set.
 * ENCRYPTION_KEY_OLD must be a valid 64-character hex string.
 */
function getOldKey(): Buffer | null {
  const hex = process.env.ENCRYPTION_KEY_OLD;
  if (!hex) return null;
  if (!/^[0-9a-fA-F]{64}$/.test(hex)) return null;
  return Buffer.from(hex, "hex");
}

/**
 * Encrypts plaintext using AES-256-GCM.
 * Returns base64-encoded string in the format: iv:authTag:ciphertext
 *
 * Always uses the current ENCRYPTION_KEY — never the old key.
 */
export function encrypt(plaintext: string): string {
  const key = getKey();
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv);

  const encrypted = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);
  const authTag = cipher.getAuthTag();

  return [
    iv.toString("base64"),
    authTag.toString("base64"),
    encrypted.toString("base64"),
  ].join(":");
}

/** Low-level decrypt with a specific key. */
function decryptWithKey(encryptedStr: string, key: Buffer): string {
  const [ivB64, authTagB64, ciphertextB64] = encryptedStr.split(":");

  const iv = Buffer.from(ivB64, "base64");
  const authTag = Buffer.from(authTagB64, "base64");
  const ciphertext = Buffer.from(ciphertextB64, "base64");

  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);

  const decrypted = Buffer.concat([
    decipher.update(ciphertext),
    decipher.final(),
  ]);

  return decrypted.toString("utf8");
}

/**
 * Decrypts a string produced by encrypt().
 * Expects base64-encoded format: iv:authTag:ciphertext
 *
 * Tries the current ENCRYPTION_KEY first. If that fails and
 * ENCRYPTION_KEY_OLD is set (valid 64-char hex), retries with the old key.
 * This enables zero-downtime key rotation.
 */
export function decrypt(encryptedStr: string): string {
  const key = getKey();
  try {
    return decryptWithKey(encryptedStr, key);
  } catch (primaryError) {
    const oldKey = getOldKey();
    if (oldKey) {
      return decryptWithKey(encryptedStr, oldKey);
    }
    throw primaryError;
  }
}

/**
 * Encrypts a JSON-serializable object.
 */
export function encryptJson(data: unknown): string {
  return encrypt(JSON.stringify(data));
}

/**
 * Decrypts and parses a JSON object.
 */
export function decryptJson<T = unknown>(encrypted: string): T {
  return JSON.parse(decrypt(encrypted)) as T;
}
