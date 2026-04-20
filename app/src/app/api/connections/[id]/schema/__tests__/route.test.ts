import { describe, it, expect, vi, beforeEach } from "vitest";
import { makeParams } from "@/__tests__/helpers/request-helpers";
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
const mockDecryptJson = vi.fn();
const mockFetchConnectionSchema = vi.fn();

function makeSelectChain(rows: unknown[]) {
  return {
    from: () => ({
      where: () => ({
        limit: () => Promise.resolve(rows),
      }),
    }),
  };
}

const mockDb = { select: vi.fn() };

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
vi.mock("@/lib/crypto/crypto", () => ({ decryptJson: mockDecryptJson }));
vi.mock("@/lib/connector/schema-prefetch", () => ({
  fetchConnectionSchema: mockFetchConnectionSchema,
}));
vi.mock("next/server", () => nextResponseMockFactory());
vi.mock("@/lib/auth/errors", () => ({ UnauthorizedError, ForbiddenError }));

const SESSION = {
  userId: "user-1",
  role: "creator",
  canWrite: true,
  tenantId: "t1",
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("GET /api/connections/[id]/schema", () => {
  let GET: (
    req: Request,
    ctx: { params: Promise<{ id: string }> },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ) => Promise<any>;

  beforeEach(async () => {
    vi.resetModules();
    vi.clearAllMocks();
    const mod = await import("../route");
    GET = mod.GET;
  });

  it("returns 401 when unauthenticated", async () => {
    mockRequireSession.mockRejectedValue(new UnauthorizedError());
    const res = await GET({} as Request, makeParams("c1"));
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error.code).toBe("UNAUTHORIZED");
  });

  it("returns 404 when connection not found or not owned", async () => {
    mockRequireSession.mockResolvedValue(SESSION);
    mockDb.select.mockReturnValue(makeSelectChain([]));
    const res = await GET({} as Request, makeParams("c1"));
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error.code).toBe("NOT_FOUND");
  });

  it("returns schema on success", async () => {
    mockRequireSession.mockResolvedValue(SESSION);
    const conn = {
      id: "c1",
      userId: "user-1",
      type: "neo4j",
      configEncrypted: "enc",
    };
    mockDb.select.mockReturnValue(makeSelectChain([conn]));
    mockDecryptJson.mockReturnValue({
      uri: "bolt://localhost",
      username: "neo4j",
      password: "pass",
    });
    const schema = {
      labels: ["Person", "Movie"],
      relationshipTypes: ["ACTED_IN"],
    };
    mockFetchConnectionSchema.mockResolvedValue(schema);

    const res = await GET({} as Request, makeParams("c1"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data).toEqual(schema);
    expect(body.error).toBeNull();
  });

  it("returns 500 when fetchConnectionSchema throws", async () => {
    mockRequireSession.mockResolvedValue(SESSION);
    const conn = {
      id: "c1",
      userId: "user-1",
      type: "postgresql",
      configEncrypted: "enc",
    };
    mockDb.select.mockReturnValue(makeSelectChain([conn]));
    mockDecryptJson.mockReturnValue({
      uri: "pg://localhost",
      username: "pg",
      password: "pass",
    });
    mockFetchConnectionSchema.mockRejectedValue(
      new Error("Schema fetch failed"),
    );

    const res = await GET({} as Request, makeParams("c1"));
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error.code).toBe("INTERNAL_ERROR");
    // handleRouteError surfaces the actual error message (sanitized). See #575.
    expect(body.error.message).toBe("Schema fetch failed");
  });
});
