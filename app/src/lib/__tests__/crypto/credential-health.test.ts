import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createCipheriv, randomBytes } from "node:crypto";

const mockExecute = vi.fn();

vi.mock("@/lib/db", () => ({ db: { execute: mockExecute } }));
vi.mock("drizzle-orm", () => ({
  sql: (strings: TemplateStringsArray) => strings[0],
}));

const KEY_A = "a".repeat(64);
const KEY_B = "b".repeat(64);

/**
 * Encrypt with an arbitrary key, the same way crypto.ts does. Real ciphertext,
 * not a fixture — a hand-written string would exercise the parser and never
 * the cipher, and the cipher is the whole point of this probe.
 */
function encryptWith(keyHex: string, plaintext: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", Buffer.from(keyHex, "hex"), iv);
  const data = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);
  return [
    iv.toString("base64"),
    cipher.getAuthTag().toString("base64"),
    data.toString("base64"),
  ].join(":");
}

/** Fresh module per case — crypto.ts reads the key at call time via getKey(). */
async function loadProbe() {
  vi.resetModules();
  const mod = await import("../../crypto/credential-health");
  return mod.probeCredentialDecryption;
}

describe("probeCredentialDecryption (#1274)", () => {
  const originalKey = process.env.ENCRYPTION_KEY;
  const originalOldKey = process.env.ENCRYPTION_KEY_OLD;

  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.ENCRYPTION_KEY_OLD;
  });

  afterEach(() => {
    if (originalKey !== undefined) process.env.ENCRYPTION_KEY = originalKey;
    else delete process.env.ENCRYPTION_KEY;
    if (originalOldKey !== undefined)
      process.env.ENCRYPTION_KEY_OLD = originalOldKey;
    else delete process.env.ENCRYPTION_KEY_OLD;
  });

  it("reports ok when the configured key decrypts a stored credential", async () => {
    process.env.ENCRYPTION_KEY = KEY_A;
    mockExecute.mockResolvedValue([
      { configEncrypted: encryptWith(KEY_A, '{"uri":"postgresql://h/db"}') },
    ]);
    expect(await (await loadProbe())()).toBe("ok");
  });

  it("reports mismatch for a well-formed key that is the wrong key", async () => {
    // The regression this exists to catch. Everything else in the stack
    // accepts KEY_B as valid — it is 64 hex chars — and only the GCM auth tag
    // can tell that it is not the key the data was encrypted with.
    process.env.ENCRYPTION_KEY = KEY_B;
    mockExecute.mockResolvedValue([
      { configEncrypted: encryptWith(KEY_A, '{"uri":"postgresql://h/db"}') },
    ]);
    expect(await (await loadProbe())()).toBe("mismatch");
  });

  it("reports ok mid-rotation, when only ENCRYPTION_KEY_OLD can read the row", async () => {
    // A half-completed rotation is a SUPPORTED state, not a fault: decrypt()
    // falls back to the old key, so the credentials are readable and the
    // honest answer is ok.
    process.env.ENCRYPTION_KEY = KEY_B;
    process.env.ENCRYPTION_KEY_OLD = KEY_A;
    mockExecute.mockResolvedValue([
      { configEncrypted: encryptWith(KEY_A, '{"uri":"postgresql://h/db"}') },
    ]);
    expect(await (await loadProbe())()).toBe("ok");
  });

  it("reports mismatch for tampered ciphertext", async () => {
    process.env.ENCRYPTION_KEY = KEY_A;
    const [iv, tag, data] = encryptWith(KEY_A, "secret").split(":");
    const flipped = Buffer.from(data, "base64");
    flipped[0] ^= 0xff;
    mockExecute.mockResolvedValue([
      { configEncrypted: [iv, tag, flipped.toString("base64")].join(":") },
    ]);
    expect(await (await loadProbe())()).toBe("mismatch");
  });

  it.each([
    ["an empty result set", []],
    ["a row with no ciphertext", [{ configEncrypted: "" }]],
  ])("reports no-credentials for %s, not ok", async (_label, rows) => {
    // "ok" would assert a verification that never ran — the same false
    // confidence this probe exists to remove.
    process.env.ENCRYPTION_KEY = KEY_A;
    mockExecute.mockResolvedValue(rows);
    expect(await (await loadProbe())()).toBe("no-credentials");
  });

  it("reports unknown when the query throws, not mismatch", async () => {
    // Unreachable database, or a pre-migration boot with no `connection`
    // table. Calling that a key mismatch would send an operator to rotate a
    // key that is fine; health already reports db status separately.
    process.env.ENCRYPTION_KEY = KEY_A;
    mockExecute.mockRejectedValue(new Error("relation does not exist"));
    expect(await (await loadProbe())()).toBe("unknown");
  });

  it.each([
    ["unset", undefined],
    ["malformed", "not-64-hex"],
  ])(
    "reports unknown for a %s ENCRYPTION_KEY, not mismatch",
    async (_label, key) => {
      // A missing or malformed key is a configuration problem, already
      // reported by env-config at boot. Calling it a mismatch would send the
      // operator to rotate a key that does not exist. Writing this test is
      // what surfaced the behaviour — the first version returned "mismatch",
      // because getKey() throws inside the inner try/catch.
      if (key === undefined) delete process.env.ENCRYPTION_KEY;
      else process.env.ENCRYPTION_KEY = key;
      mockExecute.mockResolvedValue([
        { configEncrypted: encryptWith(KEY_A, "x") },
      ]);
      expect(await (await loadProbe())()).toBe("unknown");
      // Cheaper too: no reason to query when the key cannot possibly work.
      expect(mockExecute).not.toHaveBeenCalled();
    },
  );

  it("returns a status only — never the plaintext it decrypted", async () => {
    process.env.ENCRYPTION_KEY = KEY_A;
    mockExecute.mockResolvedValue([
      { configEncrypted: encryptWith(KEY_A, '{"password":"hunter2"}') },
    ]);
    const result = await (await loadProbe())();
    expect(typeof result).toBe("string");
    expect(result).not.toContain("hunter2");
  });
});
