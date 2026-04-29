import { describe, it, expect, vi, beforeEach } from "vitest";
import { makeRequest } from "@/__tests__/helpers/request-helpers";
import { nextResponseMockFactory } from "@/__tests__/helpers/next-mocks";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockRequireSession = vi.fn<
  () => Promise<{
    userId: string;
    role: string;
    canWrite: boolean;
    tenantId: string;
  }>
>();
const mockDb = {
  select: vi.fn(),
};
const mockDecryptJson = vi.fn();
const mockListDatabases = vi.fn();

vi.mock("@/lib/auth/session", () => ({ requireSession: mockRequireSession }));
vi.mock("@/lib/db", () => ({ db: mockDb }));
vi.mock("@/lib/crypto/crypto", () => ({
  decryptJson: mockDecryptJson,
  encryptJson: vi.fn(),
}));
vi.mock("@/lib/query/query-executor", () => ({
  listDatabases: mockListDatabases,
}));
vi.mock("next/server", () => nextResponseMockFactory());
vi.mock("@/lib/auth/errors", () => ({
  UnauthorizedError: class extends Error {
    constructor() {
      super("Unauthorized");
    }
  },
}));

const SESSION = {
  userId: "user-1",
  role: "creator",
  canWrite: true,
  tenantId: "t1",
};

function drizzleSelectChain(rows: unknown[]) {
  const chain = {
    from: () => chain,
    where: () => chain,
    limit: () => Promise.resolve(rows),
  };
  return chain;
}

const fakeConnection = {
  id: "c1",
  type: "neo4j",
  configEncrypted: "enc",
  userId: "user-1",
  tenantId: "t1",
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("GET /api/connections/[id]/databases", () => {
  let GET: (
    req: Request,
    ctx: { params: Promise<{ id: string }> },
  ) => Promise<Response>;

  beforeEach(async () => {
    vi.resetModules();
    vi.clearAllMocks();
    const mod = await import("../route");
    GET = mod.GET;
  });

  it("returns 401 when unauthenticated", async () => {
    mockRequireSession.mockRejectedValue(new Error("Unauthorized"));
    const res = await GET(makeRequest({}), {
      params: Promise.resolve({ id: "c1" }),
    });
    expect(res.status).toBe(401);
  });

  it("returns 404 when connection not found", async () => {
    mockRequireSession.mockResolvedValue(SESSION);
    mockDb.select.mockReturnValue(drizzleSelectChain([]));
    const res = await GET(makeRequest({}), {
      params: Promise.resolve({ id: "c1" }),
    });
    expect(res.status).toBe(404);
  });

  it("returns database list on success", async () => {
    mockRequireSession.mockResolvedValue(SESSION);
    mockDb.select.mockReturnValue(drizzleSelectChain([fakeConnection]));
    mockDecryptJson.mockReturnValue({
      uri: "bolt://localhost",
      username: "neo4j",
      password: "pass",
    });
    mockListDatabases.mockResolvedValue(["neo4j", "movies"]);

    const res = await GET(makeRequest({}), {
      params: Promise.resolve({ id: "c1" }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.databases).toEqual(["neo4j", "movies"]);
  });

  it("calls listDatabases with correct type and credentials", async () => {
    mockRequireSession.mockResolvedValue(SESSION);
    mockDb.select.mockReturnValue(drizzleSelectChain([fakeConnection]));
    mockDecryptJson.mockReturnValue({
      uri: "bolt://localhost",
      username: "neo4j",
      password: "pass",
    });
    mockListDatabases.mockResolvedValue([]);

    await GET(makeRequest({}), {
      params: Promise.resolve({ id: "c1" }),
    });

    expect(mockListDatabases).toHaveBeenCalledWith("neo4j", {
      uri: "bolt://localhost",
      username: "neo4j",
      password: "pass",
    });
  });

  it("returns empty array when listDatabases throws", async () => {
    mockRequireSession.mockResolvedValue(SESSION);
    mockDb.select.mockReturnValue(drizzleSelectChain([fakeConnection]));
    mockDecryptJson.mockReturnValue({
      uri: "bolt://localhost",
      username: "neo4j",
      password: "pass",
    });
    mockListDatabases.mockRejectedValue(new Error("Driver error"));

    const res = await GET(makeRequest({}), {
      params: Promise.resolve({ id: "c1" }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.databases).toEqual([]);
  });
});
