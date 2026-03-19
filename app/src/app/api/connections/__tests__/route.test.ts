import { describe, it, expect, vi, beforeEach } from "vitest";
import { makeSelectChain, makeInsertChain } from "@/__tests__/helpers/drizzle-mocks";
import { makeRequest } from "@/__tests__/helpers/request-helpers";
import { nextResponseMockFactory } from "@/__tests__/helpers/next-mocks";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockRequireSession = vi.fn<
  () => Promise<{ userId: string; role: string; canWrite: boolean; tenantId: string }>
>();
const mockEncryptJson = vi.fn((v: unknown) => `enc:${JSON.stringify(v)}`);
const mockPrefetchSchema = vi.fn();

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
vi.mock("@/lib/db", () => ({ db: mockDb }));
vi.mock("@/lib/crypto", () => ({ encryptJson: mockEncryptJson, decryptJson: vi.fn() }));
vi.mock("@/lib/schema-prefetch", () => ({ prefetchSchema: mockPrefetchSchema }));
vi.mock("next/server", () => nextResponseMockFactory());
vi.mock("@/lib/auth/errors", () => ({ UnauthorizedError, ForbiddenError }));

const SESSION = { userId: "user-1", role: "creator", canWrite: true, tenantId: "t1" };
const ADMIN_SESSION = { userId: "admin-1", role: "admin", canWrite: true, tenantId: "t1" };

// ---------------------------------------------------------------------------
// GET /api/connections
// ---------------------------------------------------------------------------

describe("GET /api/connections", () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let GET: (req: Request) => Promise<any>;

  beforeEach(async () => {
    vi.resetModules();
    vi.clearAllMocks();
    const mod = await import("../route");
    GET = mod.GET;
  });

  it("returns 401 when unauthenticated", async () => {
    mockRequireSession.mockRejectedValue(new UnauthorizedError());
    const res = await GET(makeRequest({}, "http://localhost/api/connections"));
    expect(res.status).toBe(401);
  });

  it("returns connections in envelope with pagination meta for non-admin", async () => {
    mockRequireSession.mockResolvedValue(SESSION);
    const rows = [{ id: "c1", name: "My DB", type: "postgresql", createdAt: new Date(), updatedAt: new Date() }];
    mockDb.select.mockReturnValueOnce(makeSelectChain([{ count: 1 }]));
    mockDb.select.mockReturnValueOnce(makeSelectChain(rows));

    const res = await GET(makeRequest({}, "http://localhost/api/connections"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data).toEqual(rows);
    expect(body.meta).toEqual({ total: 1, limit: 25, offset: 0 });
    expect(body.error).toBeNull();
  });

  it("admin sees all connections in tenant", async () => {
    mockRequireSession.mockResolvedValue(ADMIN_SESSION);
    const rows = [
      { id: "c1", name: "DB 1", type: "neo4j", createdAt: new Date(), updatedAt: new Date() },
      { id: "c2", name: "DB 2", type: "postgresql", createdAt: new Date(), updatedAt: new Date() },
    ];
    mockDb.select.mockReturnValueOnce(makeSelectChain([{ count: 2 }]));
    mockDb.select.mockReturnValueOnce(makeSelectChain(rows));

    const res = await GET(makeRequest({}, "http://localhost/api/connections"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data).toHaveLength(2);
  });

  it("respects limit and offset", async () => {
    mockRequireSession.mockResolvedValue(SESSION);
    mockDb.select.mockReturnValueOnce(makeSelectChain([{ count: 10 }]));
    mockDb.select.mockReturnValueOnce(makeSelectChain([{ id: "c5", name: "DB 5", type: "neo4j", createdAt: new Date(), updatedAt: new Date() }]));

    const res = await GET(makeRequest({}, "http://localhost/api/connections?limit=1&offset=4"));
    const body = await res.json();
    expect(body.meta).toEqual({ total: 10, limit: 1, offset: 4 });
  });
});

// ---------------------------------------------------------------------------
// POST /api/connections
// ---------------------------------------------------------------------------

describe("POST /api/connections", () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let POST: (req: Request) => Promise<any>;

  beforeEach(async () => {
    vi.resetModules();
    vi.clearAllMocks();
    const mod = await import("../route");
    POST = mod.POST;
  });

  it("returns 401 when unauthenticated", async () => {
    mockRequireSession.mockRejectedValue(new UnauthorizedError());
    const res = await POST(makeRequest({ name: "DB", type: "neo4j", config: { uri: "bolt://localhost", username: "neo4j", password: "pass" } }));
    expect(res.status).toBe(401);
  });

  it("returns 400 for invalid body (missing name)", async () => {
    mockRequireSession.mockResolvedValue(SESSION);
    const res = await POST(makeRequest({ type: "neo4j", config: { uri: "bolt://localhost", username: "neo4j", password: "pass" } }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error.code).toBe("VALIDATION_ERROR");
  });

  it("creates connection and returns 201 envelope", async () => {
    mockRequireSession.mockResolvedValue(SESSION);
    const created = { id: "c1", name: "Neo4j", type: "neo4j", createdAt: new Date() };
    mockDb.insert.mockReturnValue(makeInsertChain([created]));

    const res = await POST(makeRequest({
      name: "Neo4j",
      type: "neo4j",
      config: { uri: "bolt://localhost", username: "neo4j", password: "pass" },
    }));

    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.data).toEqual(created);
    expect(body.error).toBeNull();
    expect(mockEncryptJson).toHaveBeenCalled();
    expect(mockPrefetchSchema).toHaveBeenCalled();
  });
});
