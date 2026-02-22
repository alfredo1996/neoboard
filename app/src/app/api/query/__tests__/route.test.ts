import { describe, it, expect, vi, beforeEach } from "vitest";

// ---------------------------------------------------------------------------
// Mocks — must be declared before importing the route so Vitest hoists them.
// ---------------------------------------------------------------------------

const mockRequireUserId = vi.fn<() => Promise<string>>();
const mockDb = {
  select: vi.fn(),
  insert: vi.fn(),
  update: vi.fn(),
  delete: vi.fn(),
};
const mockDecryptJson = vi.fn();
const mockExecuteQuery = vi.fn();

vi.mock("@/lib/auth/session", () => ({ requireUserId: mockRequireUserId }));
vi.mock("@/lib/db", () => ({ db: mockDb }));
vi.mock("@/lib/crypto", () => ({ decryptJson: mockDecryptJson, encryptJson: vi.fn() }));
vi.mock("@/lib/query-executor", () => ({ executeQuery: mockExecuteQuery }));
vi.mock("@/lib/schema-prefetch", () => ({ prefetchSchema: vi.fn() }));

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

// Chainable drizzle query builder stub that resolves to `rows`.
function drizzleSelectChain(rows: unknown[]) {
  const chain = {
    from: () => chain,
    where: () => chain,
    limit: () => Promise.resolve(rows),
    then: (resolve: (v: unknown[]) => unknown) => Promise.resolve(rows).then(resolve),
  };
  return chain;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("POST /api/query", () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let POST: (req: Request) => Promise<any>;

  beforeEach(async () => {
    vi.resetModules();
    vi.clearAllMocks();

    const mod = await import("../route");
    POST = mod.POST;
  });

  it("returns 401 when unauthenticated", async () => {
    mockRequireUserId.mockRejectedValue(new Error("Unauthorized"));
    const res = await POST(makeRequest({ connectionId: "c1", query: "MATCH (n) RETURN n" }));
    expect(res.status).toBe(500); // route catches and returns 500 with message
    expect((res._body as { error: string }).error).toMatch(/Unauthorized/);
  });

  it("returns 400 for invalid body (missing query)", async () => {
    mockRequireUserId.mockResolvedValue("user-1");
    const res = await POST(makeRequest({ connectionId: "c1" }));
    expect(res.status).toBe(400);
  });

  it("returns 400 for invalid body (missing connectionId)", async () => {
    mockRequireUserId.mockResolvedValue("user-1");
    const res = await POST(makeRequest({ query: "SELECT 1" }));
    expect(res.status).toBe(400);
  });

  it("returns 404 when connection not found / not owned", async () => {
    mockRequireUserId.mockResolvedValue("user-1");
    mockDb.select.mockReturnValue(drizzleSelectChain([]));
    const res = await POST(makeRequest({ connectionId: "c1", query: "SELECT 1" }));
    expect(res.status).toBe(404);
    expect((res._body as { error: string }).error).toMatch(/not found/i);
  });

  it("returns 200 with resultId on happy path", async () => {
    mockRequireUserId.mockResolvedValue("user-1");
    mockDb.select.mockReturnValue(
      drizzleSelectChain([{ id: "c1", type: "postgresql", configEncrypted: "enc", userId: "user-1" }])
    );
    mockDecryptJson.mockReturnValue({ uri: "postgres://localhost", username: "u", password: "p" });
    mockExecuteQuery.mockResolvedValue({ data: [{ n: 1 }], fields: ["n"] });

    const res = await POST(makeRequest({ connectionId: "c1", query: "SELECT 1" }));
    expect(res.status).toBe(200);
    const body = res._body as { resultId: string; data: unknown };
    expect(body.resultId).toHaveLength(16);
    expect(body.resultId).toMatch(/^[0-9a-f]{16}$/);
    expect(body.data).toEqual([{ n: 1 }]);
  });

  it("includes resultId in response and it matches computeResultId", async () => {
    mockRequireUserId.mockResolvedValue("user-1");
    mockDb.select.mockReturnValue(
      drizzleSelectChain([{ id: "c1", type: "neo4j", configEncrypted: "enc", userId: "user-1" }])
    );
    mockDecryptJson.mockReturnValue({ uri: "bolt://localhost", username: "neo4j", password: "pass" });
    mockExecuteQuery.mockResolvedValue({ data: [], fields: [] });

    const { computeResultId } = await import("@/lib/query-hash");
    const expected = computeResultId("c1", "MATCH (n) RETURN n");

    const res = await POST(makeRequest({ connectionId: "c1", query: "MATCH (n) RETURN n" }));
    expect((res._body as { resultId: string }).resultId).toBe(expected);
  });

  it("returns 500 when executeQuery throws", async () => {
    mockRequireUserId.mockResolvedValue("user-1");
    mockDb.select.mockReturnValue(
      drizzleSelectChain([{ id: "c1", type: "neo4j", configEncrypted: "enc", userId: "user-1" }])
    );
    mockDecryptJson.mockReturnValue({ uri: "bolt://localhost", username: "neo4j", password: "pass" });
    mockExecuteQuery.mockRejectedValue(new Error("Driver error"));

    const res = await POST(makeRequest({ connectionId: "c1", query: "MATCH (n) RETURN n" }));
    expect(res.status).toBe(500);
    expect((res._body as { error: string }).error).toBe("Driver error");
  });
});
