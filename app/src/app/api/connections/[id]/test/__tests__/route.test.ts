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
vi.mock("@/lib/crypto/crypto", () => ({ decryptJson: mockDecryptJson }));
vi.mock("@/lib/query/query-executor", () => ({
  testConnection: mockTestConnection,
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

describe("POST /api/connections/[id]/test", () => {
  let POST: (
    req: Request,
    ctx: { params: Promise<{ id: string }> },
  ) => Promise<Response>;

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
    mockTestConnection.mockResolvedValue(true);

    const res = await POST({} as Request, makeParams("c1"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.success).toBe(true);
    expect(body.error).toBeNull();
  });

  it("returns success:false with error message when testConnection throws", async () => {
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
    mockTestConnection.mockRejectedValue(new Error("Connection refused"));

    const res = await POST({} as Request, makeParams("c1"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.success).toBe(false);
    expect(body.data.error).toBe("Connection refused");
  });

  // Lost/rotated ENCRYPTION_KEY is a documented operational failure mode —
  // it must surface as an actionable test result, not an unhandled 500 (#1040).
  it("returns a structured decrypt_failed result when stored credentials can't be decrypted", async () => {
    mockRequireSession.mockResolvedValue(SESSION);
    const conn = {
      id: "c1",
      userId: "user-1",
      type: "postgresql",
      configEncrypted: "enc-with-wrong-key",
    };
    mockDb.select.mockReturnValue(makeSelectChain([conn]));
    // AES-GCM auth failure — exactly what Decipheriv.final throws
    mockDecryptJson.mockImplementation(() => {
      throw new Error("Unsupported state or unable to authenticate data");
    });

    const res = await POST({} as Request, makeParams("c1"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.success).toBe(false);
    expect(body.data.code).toBe("decrypt_failed");
    // Actionable: names the likely cause and the recovery path
    expect(body.data.error).toMatch(/can't be decrypted/i);
    expect(body.data.error).toMatch(/re-enter/i);
    // The connector must never be called with garbage credentials
    expect(mockTestConnection).not.toHaveBeenCalled();
  });
});
