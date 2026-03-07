import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Valid 64-char hex key (32 bytes)
const TEST_KEY = "a".repeat(64);

describe("crypto", () => {
  const originalEnv = process.env.ENCRYPTION_KEY;

  beforeEach(() => {
    // Reset module cache so getKey() picks up new env
    vi.resetModules();
    process.env.ENCRYPTION_KEY = TEST_KEY;
  });

  afterEach(() => {
    process.env.ENCRYPTION_KEY = originalEnv;
  });

  async function loadCrypto() {
    return import("../crypto");
  }

  describe("getKey validation (via encrypt)", () => {
    it("throws when ENCRYPTION_KEY is missing", async () => {
      delete process.env.ENCRYPTION_KEY;
      const { encrypt } = await loadCrypto();
      expect(() => encrypt("test")).toThrow(
        "ENCRYPTION_KEY must be a 64-character hex string"
      );
    });

    it("throws when ENCRYPTION_KEY is too short", async () => {
      process.env.ENCRYPTION_KEY = "abcd";
      const { encrypt } = await loadCrypto();
      expect(() => encrypt("test")).toThrow(
        "ENCRYPTION_KEY must be a 64-character hex string"
      );
    });

    it("throws when ENCRYPTION_KEY is too long", async () => {
      process.env.ENCRYPTION_KEY = "a".repeat(128);
      const { encrypt } = await loadCrypto();
      expect(() => encrypt("test")).toThrow(
        "ENCRYPTION_KEY must be a 64-character hex string"
      );
    });
  });

  describe("encrypt / decrypt", () => {
    it("roundtrip: decrypt(encrypt(plaintext)) === plaintext", async () => {
      const { encrypt, decrypt } = await loadCrypto();
      const plaintext = "hello world — special chars: €∞";
      const encrypted = encrypt(plaintext);
      expect(decrypt(encrypted)).toBe(plaintext);
    });

    it("produces iv:authTag:ciphertext format (3 base64 segments)", async () => {
      const { encrypt } = await loadCrypto();
      const encrypted = encrypt("test");
      const parts = encrypted.split(":");
      expect(parts).toHaveLength(3);
      // Each part should be valid base64
      for (const part of parts) {
        expect(() => Buffer.from(part, "base64")).not.toThrow();
        expect(part.length).toBeGreaterThan(0);
      }
    });

    it("each encrypt call produces different ciphertext (random IV)", async () => {
      const { encrypt } = await loadCrypto();
      const a = encrypt("same input");
      const b = encrypt("same input");
      expect(a).not.toBe(b);
    });

    it("handles empty string", async () => {
      const { encrypt, decrypt } = await loadCrypto();
      const encrypted = encrypt("");
      expect(decrypt(encrypted)).toBe("");
    });

    it("handles long plaintext", async () => {
      const { encrypt, decrypt } = await loadCrypto();
      const longText = "x".repeat(100_000);
      expect(decrypt(encrypt(longText))).toBe(longText);
    });

    it("throws on tampered ciphertext (GCM integrity check)", async () => {
      const { encrypt, decrypt } = await loadCrypto();
      const encrypted = encrypt("secret");
      const parts = encrypted.split(":");
      // Tamper with ciphertext portion
      const tamperedCiphertext = Buffer.from(parts[2], "base64");
      tamperedCiphertext[0] ^= 0xff;
      parts[2] = tamperedCiphertext.toString("base64");
      expect(() => decrypt(parts.join(":"))).toThrow();
    });

    it("throws on tampered auth tag", async () => {
      const { encrypt, decrypt } = await loadCrypto();
      const encrypted = encrypt("secret");
      const parts = encrypted.split(":");
      // Tamper with auth tag
      const tamperedTag = Buffer.from(parts[1], "base64");
      tamperedTag[0] ^= 0xff;
      parts[1] = tamperedTag.toString("base64");
      expect(() => decrypt(parts.join(":"))).toThrow();
    });
  });

  describe("encryptJson / decryptJson", () => {
    it("roundtrip with nested object", async () => {
      const { encryptJson, decryptJson } = await loadCrypto();
      const data = {
        uri: "bolt://localhost:7687",
        credentials: { user: "neo4j", password: "s3cret" },
        tags: [1, 2, 3],
      };
      const encrypted = encryptJson(data);
      expect(decryptJson(encrypted)).toEqual(data);
    });

    it("roundtrip with primitive values", async () => {
      const { encryptJson, decryptJson } = await loadCrypto();
      expect(decryptJson(encryptJson(42))).toBe(42);
      expect(decryptJson(encryptJson("hello"))).toBe("hello");
      expect(decryptJson(encryptJson(null))).toBeNull();
      expect(decryptJson(encryptJson(true))).toBe(true);
    });

    it("preserves type fidelity for arrays", async () => {
      const { encryptJson, decryptJson } = await loadCrypto();
      const arr = [1, "two", { three: 3 }];
      expect(decryptJson(encryptJson(arr))).toEqual(arr);
    });
  });
});
