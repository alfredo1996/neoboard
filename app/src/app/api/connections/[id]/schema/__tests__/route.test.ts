import { describe, it, expect, vi, beforeEach } from "vitest";
import { makeParams } from "@/__tests__/helpers/request-helpers";
import { nextResponseMockFactory } from "@/__tests__/helpers/next-mocks";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockRequireUserId = vi.fn<() => Promise<string>>();
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

vi.mock("@/lib/auth/session", () => ({ requireUserId: mockRequireUserId }));
vi.mock("@/lib/db", () => ({ db: mockDb }));
vi.mock("@/lib/crypto", () => ({ decryptJson: mockDecryptJson }));
vi.mock("@/lib/schema-prefetch", () => ({ fetchConnectionSchema: mockFetchConnectionSchema }));
vi.mock("next/server", () => nextResponseMockFactory());

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("GET /api/connections/[id]/schema", () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let GET: (req: Request, ctx: { params: Promise<{ id: string }> }) => Promise<any>;

  beforeEach(async () => {
    vi.resetModules();
    vi.clearAllMocks();
    const mod = await import("../route");
    GET = mod.GET;
  });

  it("returns 500 with 'Unauthorized' when unauthenticated", async () => {
    mockRequireUserId.mockRejectedValue(new Error("Unauthorized"));
    const res = await GET({} as Request, makeParams("c1"));
    expect(res.status).toBe(500);
    expect(res._body.error).toBe("Unauthorized");
  });

  it("returns 404 when connection not found or not owned", async () => {
    mockRequireUserId.mockResolvedValue("user-1");
    mockDb.select.mockReturnValue(makeSelectChain([]));
    const res = await GET({} as Request, makeParams("c1"));
    expect(res.status).toBe(404);
    expect(res._body.error).toBe("Not found");
  });

  it("returns schema on success", async () => {
    mockRequireUserId.mockResolvedValue("user-1");
    const conn = { id: "c1", userId: "user-1", type: "neo4j", configEncrypted: "enc" };
    mockDb.select.mockReturnValue(makeSelectChain([conn]));
    mockDecryptJson.mockReturnValue({ uri: "bolt://localhost", username: "neo4j", password: "pass" });
    const schema = { labels: ["Person", "Movie"], relationshipTypes: ["ACTED_IN"] };
    mockFetchConnectionSchema.mockResolvedValue(schema);

    const res = await GET({} as Request, makeParams("c1"));
    expect(res.status).toBe(200);
    expect(res._body).toEqual(schema);
  });

  it("returns 500 when fetchConnectionSchema throws", async () => {
    mockRequireUserId.mockResolvedValue("user-1");
    const conn = { id: "c1", userId: "user-1", type: "postgresql", configEncrypted: "enc" };
    mockDb.select.mockReturnValue(makeSelectChain([conn]));
    mockDecryptJson.mockReturnValue({ uri: "pg://localhost", username: "pg", password: "pass" });
    mockFetchConnectionSchema.mockRejectedValue(new Error("Schema fetch failed"));

    const res = await GET({} as Request, makeParams("c1"));
    expect(res.status).toBe(500);
    expect(res._body.error).toBe("Schema fetch failed");
  });
});
