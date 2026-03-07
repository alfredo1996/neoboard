import { describe, it, expect, vi, beforeEach } from "vitest";
import { makeParams } from "@/__tests__/helpers/request-helpers";
import { nextResponseMockFactory } from "@/__tests__/helpers/next-mocks";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockRequireUserId = vi.fn<() => Promise<string>>();
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

vi.mock("@/lib/auth/session", () => ({ requireUserId: mockRequireUserId }));
vi.mock("@/lib/db", () => ({ db: mockDb }));
vi.mock("@/lib/crypto", () => ({ decryptJson: mockDecryptJson }));
vi.mock("@/lib/query-executor", () => ({ testConnection: mockTestConnection }));
vi.mock("next/server", () => nextResponseMockFactory());

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

  it("returns 500 with 'Unauthorized' when unauthenticated", async () => {
    mockRequireUserId.mockRejectedValue(new Error("Unauthorized"));
    const res = await POST({} as Request, makeParams("c1"));
    expect(res.status).toBe(500);
    expect(res._body.error).toBe("Unauthorized");
  });

  it("returns 404 when connection not found or not owned", async () => {
    mockRequireUserId.mockResolvedValue("user-1");
    mockDb.select.mockReturnValue(makeSelectChain([]));
    const res = await POST({} as Request, makeParams("c1"));
    expect(res.status).toBe(404);
    expect(res._body.error).toBe("Not found");
  });

  it("returns success:true when test passes", async () => {
    mockRequireUserId.mockResolvedValue("user-1");
    const conn = { id: "c1", userId: "user-1", type: "neo4j", configEncrypted: "enc" };
    mockDb.select.mockReturnValue(makeSelectChain([conn]));
    mockDecryptJson.mockReturnValue({ uri: "bolt://localhost", username: "neo4j", password: "pass" });
    mockTestConnection.mockResolvedValue(true);

    const res = await POST({} as Request, makeParams("c1"));
    expect(res.status).toBe(200);
    expect(res._body.success).toBe(true);
  });

  it("returns 500 when testConnection throws", async () => {
    mockRequireUserId.mockResolvedValue("user-1");
    const conn = { id: "c1", userId: "user-1", type: "postgresql", configEncrypted: "enc" };
    mockDb.select.mockReturnValue(makeSelectChain([conn]));
    mockDecryptJson.mockReturnValue({ uri: "pg://localhost", username: "pg", password: "pass" });
    mockTestConnection.mockRejectedValue(new Error("Connection refused"));

    const res = await POST({} as Request, makeParams("c1"));
    expect(res.status).toBe(500);
    expect(res._body.error).toBe("Connection refused");
  });
});
