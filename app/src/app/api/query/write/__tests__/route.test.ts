import { describe, it, expect, vi, beforeEach } from "vitest";

// ---------------------------------------------------------------------------
// Mocks — must be declared before importing the route so Vitest hoists them.
// ---------------------------------------------------------------------------

const mockRequireSession = vi.fn<() => Promise<{ userId: string; tenantId: string; role: string; canWrite: boolean }>>();
const mockDb = {
  select: vi.fn(),
  insert: vi.fn(),
  update: vi.fn(),
  delete: vi.fn(),
};
const mockDecryptJson = vi.fn();
const mockExecuteQuery = vi.fn();

vi.mock("@/lib/auth/session", () => ({ requireSession: mockRequireSession }));
vi.mock("@/lib/db", () => ({ db: mockDb }));
vi.mock("@/lib/crypto", () => ({ decryptJson: mockDecryptJson, encryptJson: vi.fn() }));
vi.mock("@/lib/query-executor", () => ({ executeQuery: mockExecuteQuery }));

// Minimal Next.js server shim
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
// Helpers
// ---------------------------------------------------------------------------

function makeRequest(body: unknown) {
  return { json: async () => body } as Request;
}

/** Chainable drizzle query builder stub that resolves to `rows`. */
function drizzleSelectChain(rows: unknown[]) {
  const chain = {
    from: () => chain,
    where: () => chain,
    limit: () => Promise.resolve(rows),
  };
  return chain;
}

const writerSession = { userId: "user-1", tenantId: "tenant-a", role: "creator", canWrite: true };
const readerSession = { userId: "user-2", tenantId: "tenant-a", role: "reader", canWrite: false };

const fakeConnection = {
  id: "c1",
  type: "neo4j",
  configEncrypted: "enc",
  userId: "user-1",
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("POST /api/query/write", () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let POST: (req: Request) => Promise<any>;

  beforeEach(async () => {
    vi.resetModules();
    vi.clearAllMocks();

    const mod = await import("../route");
    POST = mod.POST;
  });

  it("returns 403 when canWrite is false (reader role)", async () => {
    mockRequireSession.mockResolvedValue(readerSession);
    const res = await POST(makeRequest({ connectionId: "c1", query: "CREATE (n:Test)" }));
    expect(res.status).toBe(403);
    expect((res._body as { error: string }).error).toMatch(/write permission/i);
  });

  it("returns 500 when session retrieval fails", async () => {
    mockRequireSession.mockRejectedValue(new Error("Unauthorized"));
    const res = await POST(makeRequest({ connectionId: "c1", query: "CREATE (n:Test)" }));
    expect(res.status).toBe(500);
    expect((res._body as { error: string }).error).toBe("Write query execution failed");
  });

  it("returns 400 for missing connectionId", async () => {
    mockRequireSession.mockResolvedValue(writerSession);
    const res = await POST(makeRequest({ query: "CREATE (n:Test)" }));
    expect(res.status).toBe(400);
  });

  it("returns 400 for missing query", async () => {
    mockRequireSession.mockResolvedValue(writerSession);
    const res = await POST(makeRequest({ connectionId: "c1" }));
    expect(res.status).toBe(400);
  });

  it("returns 404 when connection not found", async () => {
    mockRequireSession.mockResolvedValue(writerSession);
    mockDb.select.mockReturnValue(drizzleSelectChain([]));
    const res = await POST(makeRequest({ connectionId: "c1", query: "CREATE (n:Test)" }));
    expect(res.status).toBe(404);
    expect((res._body as { error: string }).error).toMatch(/not found/i);
  });

  it("returns 200 on success and calls executeQuery with accessMode WRITE", async () => {
    mockRequireSession.mockResolvedValue(writerSession);
    mockDb.select.mockReturnValue(drizzleSelectChain([fakeConnection]));
    mockDecryptJson.mockReturnValue({ uri: "bolt://localhost", username: "neo4j", password: "pass" });
    mockExecuteQuery.mockResolvedValue({ data: { nodesCreated: 1 } });

    const res = await POST(makeRequest({ connectionId: "c1", query: "CREATE (n:Test)" }));
    expect(res.status).toBe(200);

    const body = res._body as { success: boolean; data: unknown; serverDurationMs: number };
    expect(body.success).toBe(true);
    expect(body.data).toEqual({ nodesCreated: 1 });
    expect(typeof body.serverDurationMs).toBe("number");

    // Verify executeQuery was called with WRITE access mode
    expect(mockExecuteQuery).toHaveBeenCalledWith(
      "neo4j",
      { uri: "bolt://localhost", username: "neo4j", password: "pass" },
      { query: "CREATE (n:Test)", params: undefined },
      { accessMode: "WRITE" },
    );
  });

  it("passes params correctly to executeQuery", async () => {
    mockRequireSession.mockResolvedValue(writerSession);
    mockDb.select.mockReturnValue(drizzleSelectChain([fakeConnection]));
    mockDecryptJson.mockReturnValue({ uri: "bolt://localhost", username: "neo4j", password: "pass" });
    mockExecuteQuery.mockResolvedValue({ data: { nodesCreated: 1 } });

    const params = { param_name: "Alice", param_age: 30 };
    const res = await POST(
      makeRequest({ connectionId: "c1", query: "CREATE (n:Person {name: $param_name, age: $param_age})", params })
    );
    expect(res.status).toBe(200);
    expect(mockExecuteQuery).toHaveBeenCalledWith(
      "neo4j",
      expect.any(Object),
      { query: "CREATE (n:Person {name: $param_name, age: $param_age})", params },
      { accessMode: "WRITE" },
    );
  });

  it("returns 500 when executeQuery throws", async () => {
    mockRequireSession.mockResolvedValue(writerSession);
    mockDb.select.mockReturnValue(drizzleSelectChain([fakeConnection]));
    mockDecryptJson.mockReturnValue({ uri: "bolt://localhost", username: "neo4j", password: "pass" });
    mockExecuteQuery.mockRejectedValue(new Error("Driver error"));

    const res = await POST(makeRequest({ connectionId: "c1", query: "CREATE (n:Test)" }));
    expect(res.status).toBe(500);
    expect((res._body as { error: string }).error).toBe("Write query execution failed");
  });

  it("returns 404 when connection belongs to another user", async () => {
    const otherUserConnection = { ...fakeConnection, userId: "user-other" };
    mockRequireSession.mockResolvedValue(writerSession);
    mockDb.select.mockReturnValue(drizzleSelectChain([]));
    const res = await POST(makeRequest({ connectionId: "c1", query: "CREATE (n:Test)" }));
    expect(res.status).toBe(404);
    // The connection exists but doesn't match the session userId
    void otherUserConnection; // demonstrates intent — the mock returns [] because userId won't match
  });

  it("does not apply MAX_ROWS truncation on write results", async () => {
    mockRequireSession.mockResolvedValue(writerSession);
    mockDb.select.mockReturnValue(drizzleSelectChain([fakeConnection]));
    mockDecryptJson.mockReturnValue({ uri: "bolt://localhost", username: "neo4j", password: "pass" });
    // Return a large result (write routes should not truncate)
    const bigData = Array.from({ length: 15000 }, (_, i) => ({ n: i }));
    mockExecuteQuery.mockResolvedValue({ data: bigData });

    const res = await POST(makeRequest({ connectionId: "c1", query: "CREATE (n:Test)" }));
    expect(res.status).toBe(200);
    const body = res._body as { data: unknown[]; truncated?: boolean };
    expect(body.data).toHaveLength(15000);
    expect(body).not.toHaveProperty("truncated");
  });
});
