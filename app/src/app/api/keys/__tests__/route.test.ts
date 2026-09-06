import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  makeSelectChain,
  makeInsertChain,
  sqlColumns,
  sqlValues,
} from "@/__tests__/helpers/drizzle-mocks";
import { makeRequest } from "@/__tests__/helpers/request-helpers";
import { nextResponseMockFactory } from "@/__tests__/helpers/next-mocks";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockRequireSession = vi.fn();
const mockGenerateApiKey = vi.fn(() => ({
  plaintext: "nb_" + "a".repeat(64),
  hash: "hash_" + "a".repeat(59),
  prefix: "nb_aaaaaaaa",
}));

const mockDb = {
  select: vi.fn(),
  insert: vi.fn(),
};

const mockAuditRequest = vi.fn();

class UnauthorizedError extends Error {
  constructor() {
    super("Unauthorized");
  }
}
class ForbiddenError extends Error {
  constructor() {
    super("Forbidden");
  }
}

vi.mock("@/lib/auth/session", () => ({ requireSession: mockRequireSession }));
vi.mock("@/lib/auth/api-key", () => ({ generateApiKey: mockGenerateApiKey }));
vi.mock("@/lib/db", () => ({ db: mockDb }));
// Audit is mocked so route assertions aren't polluted by its own db.insert.
vi.mock("@/lib/audit/audit", () => ({
  auditRequest: mockAuditRequest,
  auditLog: vi.fn(),
}));
vi.mock("next/server", () => nextResponseMockFactory());

// ---------------------------------------------------------------------------
// Tests — GET /api/keys
// ---------------------------------------------------------------------------

describe("GET /api/keys", () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let GET: (req: Request) => Promise<any>;

  beforeEach(async () => {
    vi.resetModules();
    vi.clearAllMocks();
    vi.doMock("@/lib/auth/session", () => ({
      requireSession: mockRequireSession,
    }));
    vi.doMock("@/lib/auth/api-key", () => ({
      generateApiKey: mockGenerateApiKey,
    }));
    vi.doMock("@/lib/db", () => ({ db: mockDb }));
    vi.doMock("next/server", () => nextResponseMockFactory());
    const mod = await import("../route");
    GET = mod.GET;
  });

  it("returns 401 when unauthenticated", async () => {
    mockRequireSession.mockRejectedValue(new UnauthorizedError());
    const res = await GET(makeRequest(null));
    expect(res.status).toBe(401);
  });

  it("returns empty array when user has no keys", async () => {
    mockRequireSession.mockResolvedValue({
      userId: "user-1",
      tenantId: "default",
      role: "creator",
      canWrite: true,
    });
    mockDb.select.mockReturnValue(makeSelectChain([]));
    const res = await GET(makeRequest(null));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data).toEqual([]);
  });

  it("returns list of keys without keyHash field", async () => {
    mockRequireSession.mockResolvedValue({
      userId: "user-1",
      tenantId: "default",
      role: "creator",
      canWrite: true,
    });
    // The route uses an explicit column select — keyHash is never fetched from the DB.
    // Mock reflects what Drizzle would actually return (only the requested columns).
    const rows = [
      {
        id: "key-1",
        name: "CI Key",
        keyPrefix: "nb_aaaaaaaa",
        lastUsedAt: null,
        expiresAt: null,
        createdAt: new Date("2026-01-01"),
      },
    ];
    mockDb.select.mockReturnValue(makeSelectChain(rows));
    const res = await GET(makeRequest(null));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data).toHaveLength(1);
    expect(body.data[0]).not.toHaveProperty("keyHash");
    expect(body.data[0].name).toBe("CI Key");
    // The non-secret display prefix is returned to clients (#1038).
    expect(body.data[0].keyPrefix).toBe("nb_aaaaaaaa");
  });

  it("only returns keys for the authenticated user (tenant-scoped)", async () => {
    mockRequireSession.mockResolvedValue({
      userId: "user-2",
      tenantId: "tenant-x",
      role: "creator",
      canWrite: true,
    });

    // The chain records what the handler passed, so this asserts the filter
    // itself rather than merely that where() was called (#1607).
    const chain = makeSelectChain([]);
    mockDb.select.mockReturnValue(chain);

    await GET(makeRequest(null));

    expect(chain.calls.where).toHaveLength(1);
    const [expr] = chain.calls.where[0];
    // `userId` is not snake-cased in this table's schema; the point is that
    // both the tenant and the caller are in the filter.
    expect(sqlColumns(expr)).toEqual(
      expect.arrayContaining(["tenant_id", "userId"]),
    );
    expect(sqlValues(expr)).toEqual(
      expect.arrayContaining(["tenant-x", "user-2"]),
    );
  });
});

// ---------------------------------------------------------------------------
// Tests — POST /api/keys
// ---------------------------------------------------------------------------

describe("POST /api/keys", () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let POST: (req: Request) => Promise<any>;

  beforeEach(async () => {
    vi.resetModules();
    vi.clearAllMocks();
    mockGenerateApiKey.mockReturnValue({
      plaintext: "nb_" + "a".repeat(64),
      hash: "hash_" + "a".repeat(59),
      prefix: "nb_aaaaaaaa",
    });
    vi.doMock("@/lib/auth/session", () => ({
      requireSession: mockRequireSession,
    }));
    vi.doMock("@/lib/auth/api-key", () => ({
      generateApiKey: mockGenerateApiKey,
    }));
    vi.doMock("@/lib/db", () => ({ db: mockDb }));
    vi.doMock("next/server", () => nextResponseMockFactory());
    vi.mock("@/lib/auth/errors", () => ({ UnauthorizedError, ForbiddenError }));
    const mod = await import("../route");
    POST = mod.POST;
  });

  it("returns 401 when unauthenticated", async () => {
    mockRequireSession.mockRejectedValue(new UnauthorizedError());
    const res = await POST(makeRequest({ name: "Test" }));
    expect(res.status).toBe(401);
  });

  it("returns 403 when user lacks canWrite permission", async () => {
    mockRequireSession.mockResolvedValue({
      userId: "user-1",
      tenantId: "default",
      role: "reader",
      canWrite: false,
    });
    const res = await POST(makeRequest({ name: "Test" }));
    expect(res.status).toBe(403);
  });

  it("returns 400 when name is missing", async () => {
    mockRequireSession.mockResolvedValue({
      userId: "user-1",
      tenantId: "default",
      role: "creator",
      canWrite: true,
    });
    const res = await POST(makeRequest({}));
    expect(res.status).toBe(400);
  });

  it("returns 400 when name is empty string", async () => {
    mockRequireSession.mockResolvedValue({
      userId: "user-1",
      tenantId: "default",
      role: "creator",
      canWrite: true,
    });
    const res = await POST(makeRequest({ name: "" }));
    expect(res.status).toBe(400);
  });

  it("returns 201 with generated key on valid request", async () => {
    mockRequireSession.mockResolvedValue({
      userId: "user-1",
      tenantId: "default",
      role: "creator",
      canWrite: true,
    });
    const insertedRow = {
      id: "new-key-id",
      name: "My CI Key",
      keyPrefix: "nb_aaaaaaaa",
      expiresAt: null,
      createdAt: new Date(),
    };
    mockDb.insert.mockReturnValue(makeInsertChain([insertedRow]));
    const res = await POST(makeRequest({ name: "My CI Key" }));
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.data.name).toBe("My CI Key");
    expect(body.data.key).toBe("nb_" + "a".repeat(64));
    // The non-secret display prefix is returned to clients (#1038).
    expect(body.data.keyPrefix).toBe("nb_aaaaaaaa");
  });

  it("records a key.create audit entry without leaking the key (#1234)", async () => {
    mockRequireSession.mockResolvedValue({
      userId: "user-1",
      tenantId: "default",
      role: "creator",
      canWrite: true,
    });
    mockDb.insert.mockReturnValue(
      makeInsertChain([
        {
          id: "new-key-id",
          name: "My CI Key",
          keyPrefix: "nb_aaaaaaaa",
          expiresAt: null,
          createdAt: new Date(),
        },
      ]),
    );

    await POST(makeRequest({ name: "My CI Key" }));

    expect(mockAuditRequest).toHaveBeenCalledTimes(1);
    const [, entry] = mockAuditRequest.mock.calls[0];
    expect(entry).toMatchObject({
      tenantId: "default",
      userId: "user-1",
      action: "key.create",
      resourceType: "api_key",
      resourceId: "new-key-id",
    });
    // The plaintext key and its hash must never reach the audit trail.
    const serialized = JSON.stringify(entry);
    expect(serialized).not.toContain("a".repeat(64));
    expect(serialized).not.toContain("hash_");
  });

  it("writes no audit entry when the request is rejected (#1234)", async () => {
    mockRequireSession.mockResolvedValue({
      userId: "user-1",
      tenantId: "default",
      role: "reader",
      canWrite: false,
    });

    const res = await POST(makeRequest({ name: "Nope" }));

    expect(res.status).toBe(403);
    expect(mockAuditRequest).not.toHaveBeenCalled();
  });

  it("returned key starts with nb_ prefix", async () => {
    mockRequireSession.mockResolvedValue({
      userId: "user-1",
      tenantId: "default",
      role: "creator",
      canWrite: true,
    });
    mockDb.insert.mockReturnValue(
      makeInsertChain([
        { id: "k1", name: "Key", expiresAt: null, createdAt: new Date() },
      ]),
    );
    const res = await POST(makeRequest({ name: "Key" }));
    const body = await res.json();
    expect(body.data.key.startsWith("nb_")).toBe(true);
  });

  it("returns 201 with null expiresAt when not provided", async () => {
    mockRequireSession.mockResolvedValue({
      userId: "user-1",
      tenantId: "default",
      role: "creator",
      canWrite: true,
    });
    mockDb.insert.mockReturnValue(
      makeInsertChain([
        { id: "k2", name: "Key", expiresAt: null, createdAt: new Date() },
      ]),
    );
    const res = await POST(makeRequest({ name: "Key" }));
    const body = await res.json();
    expect(body.data.expiresAt).toBeNull();
  });

  it("stores the hash in DB (not plaintext)", async () => {
    mockRequireSession.mockResolvedValue({
      userId: "user-1",
      tenantId: "default",
      role: "creator",
      canWrite: true,
    });

    // Spy on the values passed to insert().values()
    let capturedValues: Record<string, unknown> | null = null;
    const insertChain = {
      values: (vals: Record<string, unknown>) => {
        capturedValues = vals;
        return insertChain;
      },
      returning: () =>
        Promise.resolve([
          { id: "k3", name: "Key", expiresAt: null, createdAt: new Date() },
        ]),
    };
    mockDb.insert.mockReturnValue(insertChain);

    await POST(makeRequest({ name: "Key" }));

    expect(capturedValues).not.toBeNull();
    // The inserted row must contain keyHash (the hash), NOT the plaintext key
    expect(capturedValues!.keyHash).toBe("hash_" + "a".repeat(59));
    // The non-secret display prefix is stored for the key list (#1038)
    expect(capturedValues!.keyPrefix).toBe("nb_aaaaaaaa");
    // Plaintext key must NOT be stored in the DB row
    expect(capturedValues!).not.toHaveProperty("key");
    expect(Object.values(capturedValues!)).not.toContain(
      "nb_" + "a".repeat(64),
    );
  });

  it("passes expiresAt as Date when provided", async () => {
    mockRequireSession.mockResolvedValue({
      userId: "user-1",
      tenantId: "default",
      role: "creator",
      canWrite: true,
    });

    let capturedValues: Record<string, unknown> | null = null;
    const insertChain = {
      values: (vals: Record<string, unknown>) => {
        capturedValues = vals;
        return insertChain;
      },
      returning: () =>
        Promise.resolve([
          {
            id: "k5",
            name: "Key",
            expiresAt: "2027-01-01T00:00:00.000Z",
            createdAt: new Date(),
          },
        ]),
    };
    mockDb.insert.mockReturnValue(insertChain);

    const res = await POST(
      makeRequest({ name: "Key", expiresAt: "2027-01-01T00:00:00.000Z" }),
    );
    expect(res.status).toBe(201);
    expect(capturedValues).not.toBeNull();
    expect(capturedValues!.expiresAt).toBeInstanceOf(Date);
  });

  it("stores tenantId from session", async () => {
    mockRequireSession.mockResolvedValue({
      userId: "user-1",
      tenantId: "my-tenant",
      role: "creator",
      canWrite: true,
    });

    let capturedValues: Record<string, unknown> | null = null;
    const insertChain = {
      values: (vals: Record<string, unknown>) => {
        capturedValues = vals;
        return insertChain;
      },
      returning: () =>
        Promise.resolve([
          { id: "k4", name: "Key", expiresAt: null, createdAt: new Date() },
        ]),
    };
    mockDb.insert.mockReturnValue(insertChain);

    await POST(makeRequest({ name: "Key" }));

    expect(capturedValues).not.toBeNull();
    expect(capturedValues!.tenantId).toBe("my-tenant");
    expect(capturedValues!.userId).toBe("user-1");
  });

  it("returns 503 with admin-specific message when generateApiKey throws and user is admin", async () => {
    mockRequireSession.mockResolvedValue({
      userId: "user-1",
      tenantId: "default",
      role: "admin",
      canWrite: true,
    });
    mockGenerateApiKey.mockImplementation(() => {
      throw new Error("API_KEY_HMAC_SECRET is not set");
    });
    const res = await POST(makeRequest({ name: "My Key" }));
    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body.error.code).toBe("SERVICE_UNAVAILABLE");
    expect(body.error.message).toContain("API_KEY_HMAC_SECRET");
    expect(body.error.message).toContain("environment variables");
  });

  it("returns 503 with generic message when generateApiKey throws and user is not admin", async () => {
    mockRequireSession.mockResolvedValue({
      userId: "user-1",
      tenantId: "default",
      role: "creator",
      canWrite: true,
    });
    mockGenerateApiKey.mockImplementation(() => {
      throw new Error("API_KEY_HMAC_SECRET is not set");
    });
    const res = await POST(makeRequest({ name: "My Key" }));
    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body.error.code).toBe("SERVICE_UNAVAILABLE");
    expect(body.error.message).toContain("Contact your administrator");
    expect(body.error.message).not.toContain("API_KEY_HMAC_SECRET");
  });

  it("returns 503 with generic message when generateApiKey throws and user is creator role", async () => {
    mockRequireSession.mockResolvedValue({
      userId: "user-1",
      tenantId: "default",
      role: "creator",
      canWrite: true,
    });
    mockGenerateApiKey.mockImplementation(() => {
      throw new Error("HMAC secret missing");
    });
    const res = await POST(makeRequest({ name: "My Key" }));
    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body.error.code).toBe("SERVICE_UNAVAILABLE");
    expect(body.error.message).toBe(
      "API key service is not available. Contact your administrator.",
    );
  });
});
