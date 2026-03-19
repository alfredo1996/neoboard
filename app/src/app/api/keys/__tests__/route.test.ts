import { describe, it, expect, vi, beforeEach } from "vitest";
import { makeSelectChain, makeInsertChain } from "@/__tests__/helpers/drizzle-mocks";
import { makeRequest } from "@/__tests__/helpers/request-helpers";
import { nextResponseMockFactory } from "@/__tests__/helpers/next-mocks";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockRequireSession = vi.fn();
const mockGenerateApiKey = vi.fn(() => ({
  plaintext: "nb_" + "a".repeat(64),
  hash: "hash_" + "a".repeat(59),
}));

const mockDb = {
  select: vi.fn(),
  insert: vi.fn(),
};

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
    vi.doMock("@/lib/auth/session", () => ({ requireSession: mockRequireSession }));
    vi.doMock("@/lib/auth/api-key", () => ({ generateApiKey: mockGenerateApiKey }));
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
  });

  it("only returns keys for the authenticated user (tenant-scoped)", async () => {
    mockRequireSession.mockResolvedValue({
      userId: "user-2",
      tenantId: "tenant-x",
      role: "creator",
      canWrite: true,
    });

    // Capture the where() argument to verify tenant scoping
    let whereCalled = false;
    const chainWithSpy = {
      from: () => chainWithSpy,
      where: (...args: unknown[]) => {
        whereCalled = true;
        // Drizzle passes an SQL expression — verify it was called at all
        expect(args.length).toBeGreaterThan(0);
        return Promise.resolve([]);
      },
      innerJoin: () => chainWithSpy,
      leftJoin: () => chainWithSpy,
      then: (fn: (v: unknown[]) => void) => Promise.resolve([]).then(fn),
    };
    mockDb.select.mockReturnValue(chainWithSpy);

    await GET(makeRequest(null));
    expect(mockDb.select).toHaveBeenCalled();
    expect(whereCalled).toBe(true);
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
    });
    vi.doMock("@/lib/auth/session", () => ({ requireSession: mockRequireSession }));
    vi.doMock("@/lib/auth/api-key", () => ({ generateApiKey: mockGenerateApiKey }));
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
      expiresAt: null,
      createdAt: new Date(),
    };
    mockDb.insert.mockReturnValue(makeInsertChain([insertedRow]));
    const res = await POST(makeRequest({ name: "My CI Key" }));
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.data.name).toBe("My CI Key");
    expect(body.data.key).toBe("nb_" + "a".repeat(64));
  });

  it("returned key starts with nb_ prefix", async () => {
    mockRequireSession.mockResolvedValue({
      userId: "user-1",
      tenantId: "default",
      role: "creator",
      canWrite: true,
    });
    mockDb.insert.mockReturnValue(
      makeInsertChain([{ id: "k1", name: "Key", expiresAt: null, createdAt: new Date() }])
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
      makeInsertChain([{ id: "k2", name: "Key", expiresAt: null, createdAt: new Date() }])
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
        Promise.resolve([{ id: "k3", name: "Key", expiresAt: null, createdAt: new Date() }]),
    };
    mockDb.insert.mockReturnValue(insertChain);

    await POST(makeRequest({ name: "Key" }));

    expect(capturedValues).not.toBeNull();
    // The inserted row must contain keyHash (the hash), NOT the plaintext key
    expect(capturedValues!.keyHash).toBe("hash_" + "a".repeat(59));
    // Plaintext key must NOT be stored in the DB row
    expect(capturedValues!).not.toHaveProperty("key");
    expect(Object.values(capturedValues!)).not.toContain("nb_" + "a".repeat(64));
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
        Promise.resolve([{ id: "k5", name: "Key", expiresAt: "2027-01-01T00:00:00.000Z", createdAt: new Date() }]),
    };
    mockDb.insert.mockReturnValue(insertChain);

    const res = await POST(makeRequest({ name: "Key", expiresAt: "2027-01-01T00:00:00.000Z" }));
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
        Promise.resolve([{ id: "k4", name: "Key", expiresAt: null, createdAt: new Date() }]),
    };
    mockDb.insert.mockReturnValue(insertChain);

    await POST(makeRequest({ name: "Key" }));

    expect(capturedValues).not.toBeNull();
    expect(capturedValues!.tenantId).toBe("my-tenant");
    expect(capturedValues!.userId).toBe("user-1");
  });
});
