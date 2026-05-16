import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { randomBytes } from "crypto";

/** Generate a random 64-char hex key (32 bytes). */
function randomKey(): string {
  return randomBytes(32).toString("hex");
}

describe("crypto — key rotation (dual-key decryption)", () => {
  const originalKey = process.env.ENCRYPTION_KEY;
  const originalOldKey = process.env.ENCRYPTION_KEY_OLD;

  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    process.env.ENCRYPTION_KEY = originalKey;
    if (originalOldKey !== undefined) {
      process.env.ENCRYPTION_KEY_OLD = originalOldKey;
    } else {
      delete process.env.ENCRYPTION_KEY_OLD;
    }
  });

  async function loadCrypto() {
    return import("@/lib/crypto/crypto");
  }

  it("decrypt works when data was encrypted with old key and ENCRYPTION_KEY_OLD is set", async () => {
    const keyA = randomKey();
    const keyB = randomKey();

    // Encrypt with key A
    process.env.ENCRYPTION_KEY = keyA;
    delete process.env.ENCRYPTION_KEY_OLD;
    const { encrypt } = await loadCrypto();
    const ciphertext = encrypt("sensitive-data");

    // Now rotate: key B is primary, key A is old
    vi.resetModules();
    process.env.ENCRYPTION_KEY = keyB;
    process.env.ENCRYPTION_KEY_OLD = keyA;
    const { decrypt } = await loadCrypto();

    expect(decrypt(ciphertext)).toBe("sensitive-data");
  });

  it("decrypt fails when data was encrypted with old key and ENCRYPTION_KEY_OLD is NOT set", async () => {
    const keyA = randomKey();
    const keyB = randomKey();

    // Encrypt with key A
    process.env.ENCRYPTION_KEY = keyA;
    delete process.env.ENCRYPTION_KEY_OLD;
    const { encrypt } = await loadCrypto();
    const ciphertext = encrypt("sensitive-data");

    // Rotate key without setting ENCRYPTION_KEY_OLD
    vi.resetModules();
    process.env.ENCRYPTION_KEY = keyB;
    delete process.env.ENCRYPTION_KEY_OLD;
    const { decrypt } = await loadCrypto();

    expect(() => decrypt(ciphertext)).toThrow();
  });

  it("decrypt works with current key without needing ENCRYPTION_KEY_OLD", async () => {
    const keyB = randomKey();

    // Encrypt with key B (current)
    process.env.ENCRYPTION_KEY = keyB;
    delete process.env.ENCRYPTION_KEY_OLD;
    const { encrypt, decrypt } = await loadCrypto();
    const ciphertext = encrypt("current-key-data");

    expect(decrypt(ciphertext)).toBe("current-key-data");
  });

  it("decrypt prefers current key over old key", async () => {
    const keyB = randomKey();

    // Encrypt with current key
    process.env.ENCRYPTION_KEY = keyB;
    delete process.env.ENCRYPTION_KEY_OLD;
    const { encrypt } = await loadCrypto();
    const ciphertext = encrypt("test");

    // Set an old key too — should still decrypt with current key
    vi.resetModules();
    process.env.ENCRYPTION_KEY = keyB;
    process.env.ENCRYPTION_KEY_OLD = randomKey();
    const { decrypt } = await loadCrypto();

    expect(decrypt(ciphertext)).toBe("test");
  });

  it("encrypt always uses the current key, never the old key", async () => {
    const keyA = randomKey();
    const keyB = randomKey();

    // Set key B as primary, key A as old
    process.env.ENCRYPTION_KEY = keyB;
    process.env.ENCRYPTION_KEY_OLD = keyA;
    const { encrypt } = await loadCrypto();
    const ciphertext = encrypt("new-data");

    // Verify data can be decrypted with key B alone (no old key needed)
    vi.resetModules();
    process.env.ENCRYPTION_KEY = keyB;
    delete process.env.ENCRYPTION_KEY_OLD;
    const { decrypt } = await loadCrypto();
    expect(decrypt(ciphertext)).toBe("new-data");
  });

  it("ignores ENCRYPTION_KEY_OLD when it is an invalid hex string", async () => {
    const keyA = randomKey();
    const keyB = randomKey();

    // Encrypt with key A
    process.env.ENCRYPTION_KEY = keyA;
    delete process.env.ENCRYPTION_KEY_OLD;
    const { encrypt } = await loadCrypto();
    const ciphertext = encrypt("data");

    // Rotate with invalid old key — should not fall back
    vi.resetModules();
    process.env.ENCRYPTION_KEY = keyB;
    process.env.ENCRYPTION_KEY_OLD = "not-a-valid-hex-key";
    const { decrypt } = await loadCrypto();

    expect(() => decrypt(ciphertext)).toThrow();
  });

  it("decryptJson falls back to old key for JSON data", async () => {
    const keyA = randomKey();
    const keyB = randomKey();
    const payload = { host: "db.example.com", password: "s3cret" };

    // Encrypt with key A
    process.env.ENCRYPTION_KEY = keyA;
    delete process.env.ENCRYPTION_KEY_OLD;
    const { encryptJson } = await loadCrypto();
    const ciphertext = encryptJson(payload);

    // Rotate: key B primary, key A old
    vi.resetModules();
    process.env.ENCRYPTION_KEY = keyB;
    process.env.ENCRYPTION_KEY_OLD = keyA;
    const { decryptJson } = await loadCrypto();

    expect(decryptJson(ciphertext)).toEqual(payload);
  });
});
