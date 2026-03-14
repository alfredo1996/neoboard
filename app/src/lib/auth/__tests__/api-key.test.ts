import { describe, it, expect, vi, beforeEach } from "vitest";
import { createHmac } from "crypto";
import { makeSelectChain, makeUpdateChain } from "@/__tests__/helpers/drizzle-mocks";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const TEST_HMAC_SECRET = "test-hmac-secret-for-unit-tests";

const mockHeadersGet = vi.fn<(name: string) => string | null>();
const mockHeaders = vi.fn(() => ({ get: mockHeadersGet }));

const mockDb = {
  select: vi.fn(),
  update: vi.fn(),
};

vi.mock("next/headers", () => ({
  headers: mockHeaders,
}));

vi.mock("@/lib/db", () => ({
  db: mockDb,
}));

// ---------------------------------------------------------------------------
// Tests — generateApiKey & hashApiKey
// ---------------------------------------------------------------------------

describe("generateApiKey", () => {
  let generateApiKey: () => { plaintext: string; hash: string };

  beforeEach(async () => {
    vi.resetModules();
    vi.clearAllMocks();
    process.env.ENCRYPTION_KEY = TEST_HMAC_SECRET;
    vi.doMock("next/headers", () => ({ headers: mockHeaders }));
    vi.doMock("@/lib/db", () => ({ db: mockDb }));
    const mod = await import("../api-key");
    generateApiKey = mod.generateApiKey;
  });

  it("returns a key with nb_ prefix", () => {
    const { plaintext } = generateApiKey();
    expect(plaintext.startsWith("nb_")).toBe(true);
  });

  it("returns a key with 64 hex chars after the prefix", () => {
    const { plaintext } = generateApiKey();
    const hex = plaintext.slice("nb_".length);
    expect(hex).toMatch(/^[0-9a-f]{64}$/);
  });

  it("returns a hash field that is a 64-char hex string (HMAC-SHA256)", () => {
    const { hash } = generateApiKey();
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it("returns different keys on successive calls", () => {
    const a = generateApiKey();
    const b = generateApiKey();
    expect(a.plaintext).not.toBe(b.plaintext);
    expect(a.hash).not.toBe(b.hash);
  });
});

describe("hashApiKey", () => {
  let hashApiKey: (plaintext: string) => string;

  beforeEach(async () => {
    vi.resetModules();
    vi.clearAllMocks();
    process.env.ENCRYPTION_KEY = TEST_HMAC_SECRET;
    vi.doMock("next/headers", () => ({ headers: mockHeaders }));
    vi.doMock("@/lib/db", () => ({ db: mockDb }));
    const mod = await import("../api-key");
    hashApiKey = mod.hashApiKey;
  });

  it("returns a consistent HMAC-SHA256 hex digest", () => {
    const h1 = hashApiKey("nb_abc");
    const h2 = hashApiKey("nb_abc");
    expect(h1).toBe(h2);
    expect(h1).toMatch(/^[0-9a-f]{64}$/);
  });

  it("produces an HMAC using the server secret (not a bare hash)", () => {
    const result = hashApiKey("nb_abc");
    const expected = createHmac("sha256", TEST_HMAC_SECRET)
      .update("nb_abc")
      .digest("hex");
    expect(result).toBe(expected);
  });

  it("returns different hashes for different inputs", () => {
    expect(hashApiKey("nb_abc")).not.toBe(hashApiKey("nb_xyz"));
  });

  it("uses API_KEY_HMAC_SECRET when available (over ENCRYPTION_KEY)", async () => {
    vi.resetModules();
    process.env.API_KEY_HMAC_SECRET = "dedicated-hmac-secret";
    process.env.ENCRYPTION_KEY = TEST_HMAC_SECRET;
    vi.doMock("next/headers", () => ({ headers: mockHeaders }));
    vi.doMock("@/lib/db", () => ({ db: mockDb }));
    const mod = await import("../api-key");

    const result = mod.hashApiKey("nb_abc");
    const expected = createHmac("sha256", "dedicated-hmac-secret")
      .update("nb_abc")
      .digest("hex");
    expect(result).toBe(expected);

    delete process.env.API_KEY_HMAC_SECRET;
  });
});

// ---------------------------------------------------------------------------
// Tests — resolveApiKeyAuth
// ---------------------------------------------------------------------------

describe("resolveApiKeyAuth", () => {
  let resolveApiKeyAuth: () => Promise<{
    userId: string;
    role: string;
    canWrite: boolean;
    tenantId: string;
  } | null>;

  beforeEach(async () => {
    vi.resetModules();
    vi.clearAllMocks();
    process.env.ENCRYPTION_KEY = TEST_HMAC_SECRET;
    vi.doMock("next/headers", () => ({ headers: mockHeaders }));
    vi.doMock("@/lib/db", () => ({ db: mockDb }));
    const mod = await import("../api-key");
    resolveApiKeyAuth = mod.resolveApiKeyAuth;
  });

  it("returns null when no Authorization header is present", async () => {
    mockHeadersGet.mockReturnValue(null);
    const result = await resolveApiKeyAuth();
    expect(result).toBeNull();
  });

  it("returns null when Authorization header is not Bearer", async () => {
    mockHeadersGet.mockReturnValue("Basic dXNlcjpwYXNz");
    const result = await resolveApiKeyAuth();
    expect(result).toBeNull();
  });

  it("returns null when Bearer token lacks nb_ prefix", async () => {
    mockHeadersGet.mockReturnValue("Bearer some_other_token");
    const result = await resolveApiKeyAuth();
    expect(result).toBeNull();
  });

  it("throws generic Unauthorized when key hash not found in DB", async () => {
    mockHeadersGet.mockReturnValue("Bearer nb_" + "a".repeat(64));
    mockDb.select.mockReturnValue(makeSelectChain([]));
    await expect(resolveApiKeyAuth()).rejects.toThrow("Unauthorized");
  });

  it("throws generic Unauthorized when key is expired (no info disclosure)", async () => {
    const pastDate = new Date(Date.now() - 1000);
    mockHeadersGet.mockReturnValue("Bearer nb_" + "a".repeat(64));
    mockDb.select.mockReturnValue(
      makeSelectChain([
        {
          id: "key-1",
          userId: "user-1",
          tenantId: "default",
          role: "creator",
          canWrite: true,
          expiresAt: pastDate,
        },
      ])
    );
    await expect(resolveApiKeyAuth()).rejects.toThrow("Unauthorized");
  });

  it("returns user context for a valid non-expired key", async () => {
    const futureDate = new Date(Date.now() + 86400_000);
    mockHeadersGet.mockReturnValue("Bearer nb_" + "b".repeat(64));
    mockDb.select.mockReturnValue(
      makeSelectChain([
        {
          id: "key-2",
          userId: "user-2",
          tenantId: "tenant-abc",
          role: "creator",
          canWrite: true,
          expiresAt: futureDate,
        },
      ])
    );
    mockDb.update.mockReturnValue(makeUpdateChain());
    const result = await resolveApiKeyAuth();
    expect(result).toMatchObject({
      userId: "user-2",
      role: "creator",
      canWrite: true,
      tenantId: "tenant-abc",
    });
  });

  it("returns user context for a key with no expiry (null expiresAt)", async () => {
    mockHeadersGet.mockReturnValue("Bearer nb_" + "c".repeat(64));
    mockDb.select.mockReturnValue(
      makeSelectChain([
        {
          id: "key-3",
          userId: "user-3",
          tenantId: "default",
          role: "admin",
          canWrite: true,
          expiresAt: null,
        },
      ])
    );
    mockDb.update.mockReturnValue(makeUpdateChain());
    const result = await resolveApiKeyAuth();
    expect(result).toMatchObject({
      userId: "user-3",
      role: "admin",
      tenantId: "default",
    });
  });

  it("calls db.update to set lastUsedAt on successful resolution", async () => {
    mockHeadersGet.mockReturnValue("Bearer nb_" + "d".repeat(64));
    mockDb.select.mockReturnValue(
      makeSelectChain([
        {
          id: "key-4",
          userId: "user-4",
          tenantId: "default",
          role: "creator",
          canWrite: false,
          expiresAt: null,
        },
      ])
    );
    mockDb.update.mockReturnValue(makeUpdateChain());
    await resolveApiKeyAuth();
    expect(mockDb.update).toHaveBeenCalled();
  });
});
