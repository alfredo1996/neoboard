import { describe, it, expect, vi, beforeEach } from "vitest";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockRequireUserId = vi.fn<() => Promise<string>>();
const mockEncryptJson = vi.fn((v: unknown) => `enc:${JSON.stringify(v)}`);
const mockPrefetchSchema = vi.fn();

// Chainable drizzle builder stubs
function makeSelectChain(rows: unknown[]) {
  const c = {
    from: () => c,
    where: () => c,
    limit: () => Promise.resolve(rows),
    then: (resolve: (v: unknown[]) => unknown) => Promise.resolve(rows).then(resolve),
  };
  return c;
}

function makeInsertChain(returning: unknown[]) {
  const c = {
    values: () => c,
    returning: () => Promise.resolve(returning),
  };
  return c;
}

const mockDb = {
  select: vi.fn(),
  insert: vi.fn(),
};

vi.mock("@/lib/auth/session", () => ({ requireUserId: mockRequireUserId }));
vi.mock("@/lib/db", () => ({ db: mockDb }));
vi.mock("@/lib/crypto", () => ({ encryptJson: mockEncryptJson, decryptJson: vi.fn() }));
vi.mock("@/lib/schema-prefetch", () => ({ prefetchSchema: mockPrefetchSchema }));
vi.mock("next/server", () => ({
  NextResponse: {
    json: (body: unknown, init?: ResponseInit) => ({
      _body: body,
      status: init?.status ?? 200,
      json: async () => body,
    }),
  },
}));

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("GET /api/connections", () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let GET: () => Promise<any>;

  beforeEach(async () => {
    vi.resetModules();
    vi.clearAllMocks();
    const mod = await import("../route");
    GET = mod.GET;
  });

  it("returns 401 when unauthenticated", async () => {
    mockRequireUserId.mockRejectedValue(new Error("Unauthorized"));
    const res = await GET();
    expect(res.status).toBe(401);
  });

  it("returns list of connections for authenticated user", async () => {
    mockRequireUserId.mockResolvedValue("user-1");
    const rows = [{ id: "c1", name: "My DB", type: "postgresql", createdAt: new Date(), updatedAt: new Date() }];
    mockDb.select.mockReturnValue(makeSelectChain(rows));
    const res = await GET();
    expect(res.status).toBe(200);
    expect(res._body).toEqual(rows);
  });
});

describe("POST /api/connections", () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let POST: (req: Request) => Promise<any>;

  beforeEach(async () => {
    vi.resetModules();
    vi.clearAllMocks();
    const mod = await import("../route");
    POST = mod.POST;
  });

  function makeRequest(body: unknown) {
    return { json: async () => body } as Request;
  }

  it("returns 401 when unauthenticated", async () => {
    mockRequireUserId.mockRejectedValue(new Error("Unauthorized"));
    const res = await POST(makeRequest({ name: "DB", type: "neo4j", config: { uri: "bolt://localhost", username: "neo4j", password: "pass" } }));
    expect(res.status).toBe(401);
  });

  it("returns 400 for invalid body (missing name)", async () => {
    mockRequireUserId.mockResolvedValue("user-1");
    const res = await POST(makeRequest({ type: "neo4j", config: { uri: "bolt://localhost", username: "neo4j", password: "pass" } }));
    expect(res.status).toBe(400);
  });

  it("returns 400 for invalid type", async () => {
    mockRequireUserId.mockResolvedValue("user-1");
    const res = await POST(makeRequest({ name: "DB", type: "mysql", config: { uri: "mysql://localhost", username: "u", password: "p" } }));
    expect(res.status).toBe(400);
  });

  it("creates a neo4j connection and returns 201", async () => {
    mockRequireUserId.mockResolvedValue("user-1");
    const created = { id: "c1", name: "Neo4j", type: "neo4j", createdAt: new Date() };
    mockDb.insert.mockReturnValue(makeInsertChain([created]));

    const res = await POST(makeRequest({
      name: "Neo4j",
      type: "neo4j",
      config: { uri: "bolt://localhost", username: "neo4j", password: "pass" },
    }));

    expect(res.status).toBe(201);
    expect(res._body).toEqual(created);
    expect(mockEncryptJson).toHaveBeenCalledWith({ uri: "bolt://localhost", username: "neo4j", password: "pass" });
    expect(mockPrefetchSchema).toHaveBeenCalled();
  });

  it("creates a postgresql connection and returns 201", async () => {
    mockRequireUserId.mockResolvedValue("user-1");
    const created = { id: "c2", name: "PG", type: "postgresql", createdAt: new Date() };
    mockDb.insert.mockReturnValue(makeInsertChain([created]));

    const res = await POST(makeRequest({
      name: "PG",
      type: "postgresql",
      config: { uri: "postgres://localhost", username: "u", password: "p", database: "mydb" },
    }));

    expect(res.status).toBe(201);
    expect(res._body).toEqual(created);
  });
});
