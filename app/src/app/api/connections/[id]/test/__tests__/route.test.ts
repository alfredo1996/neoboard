import { describe, it, expect, vi, beforeEach } from "vitest";
import { makeParams } from "@/__tests__/helpers/request-helpers";
import { nextResponseMockFactory } from "@/__tests__/helpers/next-mocks";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockRequireSession = vi.fn<
  () => Promise<{ userId: string; role: string; canWrite: boolean; tenantId: string }>
>();
const mockDecryptJson = vi.fn();
const mockTestConnection = vi.fn();

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
vi.mock("@/lib/crypto", () => ({ decryptJson: mockDecryptJson }));
vi.mock("@/lib/query-executor", () => ({ testConnection: mockTestConnection }));
vi.mock("next/server", () => nextResponseMockFactory());
vi.mock("@/lib/auth/errors", () => ({ UnauthorizedError, ForbiddenError }));

const SESSION = { userId: "user-1", role: "creator", canWrite: true, tenantId: "t1" };

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("POST /api/connections/[id]/test", () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let POST: (req: Request, ctx: { params: Promise<{ id: string }> }) => Promise<any>;

  beforeEach(async () => {
    vi.resetModules();
    vi.clearAllMocks();
    const mod = await import("../route");
    POST = mod.POST;
  });

  it("returns 401 when unauthenticated", async () => {
    mockRequireSession.mockRejectedValue(new UnauthorizedError());
    const res = await POST({} as Request, makeParams("c1"));
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error.code).toBe("UNAUTHORIZED");
  });

  it("returns 404 when connection not found or not owned", async () => {
    mockRequireSession.mockResolvedValue(SESSION);
    mockDb.select.mockReturnValue(makeSelectChain([]));
    const res = await POST({} as Request, makeParams("c1"));
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error.code).toBe("NOT_FOUND");
  });

  it("returns success:true when test passes", async () => {
    mockRequireSession.mockResolvedValue(SESSION);
    const conn = { id: "c1", userId: "user-1", type: "neo4j", configEncrypted: "enc" };
    mockDb.select.mockReturnValue(makeSelectChain([conn]));
    mockDecryptJson.mockReturnValue({ uri: "bolt://localhost", username: "neo4j", password: "pass" });
    mockTestConnection.mockResolvedValue(true);

    const res = await POST({} as Request, makeParams("c1"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.success).toBe(true);
    expect(body.error).toBeNull();
  });

  it("returns 500 when testConnection throws", async () => {
    mockRequireSession.mockResolvedValue(SESSION);
    const conn = { id: "c1", userId: "user-1", type: "postgresql", configEncrypted: "enc" };
    mockDb.select.mockReturnValue(makeSelectChain([conn]));
    mockDecryptJson.mockReturnValue({ uri: "pg://localhost", username: "pg", password: "pass" });
    mockTestConnection.mockRejectedValue(new Error("Connection refused"));

    const res = await POST({} as Request, makeParams("c1"));
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error.code).toBe("INTERNAL_ERROR");
    expect(body.error.message).toBe("Connection test failed");
  });
});
