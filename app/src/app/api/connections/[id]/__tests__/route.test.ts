import { describe, it, expect, vi, beforeEach } from "vitest";
import { makeSelectChain, makeUpdateChain, makeDeleteChain } from "@/__tests__/helpers/drizzle-mocks";
import { makeRequest, makeParams } from "@/__tests__/helpers/request-helpers";
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
  update: vi.fn(),
  delete: vi.fn(),
};

vi.mock("@/lib/auth/session", () => ({ requireSession: mockRequireSession }));
vi.mock("@/lib/db", () => ({ db: mockDb }));
vi.mock("@/lib/crypto", () => ({ encryptJson: mockEncryptJson, decryptJson: vi.fn() }));
vi.mock("@/lib/schema-prefetch", () => ({ prefetchSchema: mockPrefetchSchema }));
vi.mock("next/server", () => nextResponseMockFactory());

const SESSION = { userId: "user-1", role: "creator", canWrite: true, tenantId: "t1" };
const ADMIN_SESSION = { userId: "admin-1", role: "admin", canWrite: true, tenantId: "t1" };

// ---------------------------------------------------------------------------
// GET /api/connections/[id]
// ---------------------------------------------------------------------------

describe("GET /api/connections/[id]", () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let GET: (req: Request, ctx: { params: Promise<{ id: string }> }) => Promise<any>;

  beforeEach(async () => {
    vi.resetModules();
    vi.clearAllMocks();
    const mod = await import("../route");
    GET = mod.GET;
  });

  it("returns 401 when unauthenticated", async () => {
    mockRequireSession.mockRejectedValue(new Error("Unauthorized"));
    const res = await GET(makeRequest({}), makeParams("c1"));
    expect(res.status).toBe(401);
  });

  it("returns connection metadata in envelope (owner)", async () => {
    mockRequireSession.mockResolvedValue(SESSION);
    const conn = { id: "c1", name: "My DB", type: "postgresql", createdAt: new Date(), updatedAt: new Date() };
    mockDb.select.mockReturnValue(makeSelectChain([conn]));

    const res = await GET(makeRequest({}), makeParams("c1"));
    expect(res.status).toBe(200);
    expect(res._body.data).toEqual(conn);
    expect(res._body.error).toBeNull();
  });

  it("admin can view any connection in tenant", async () => {
    mockRequireSession.mockResolvedValue(ADMIN_SESSION);
    const conn = { id: "c1", name: "Other DB", type: "neo4j", createdAt: new Date(), updatedAt: new Date() };
    // First select (owner check) returns empty
    mockDb.select.mockReturnValueOnce(makeSelectChain([]));
    // Second select (admin fallback) returns the connection
    mockDb.select.mockReturnValueOnce(makeSelectChain([conn]));

    const res = await GET(makeRequest({}), makeParams("c1"));
    expect(res.status).toBe(200);
    expect(res._body.data.id).toBe("c1");
  });

  it("returns 404 when not found or not owned", async () => {
    mockRequireSession.mockResolvedValue(SESSION);
    mockDb.select.mockReturnValue(makeSelectChain([]));

    const res = await GET(makeRequest({}), makeParams("nonexistent"));
    expect(res.status).toBe(404);
    expect(res._body.error.code).toBe("NOT_FOUND");
  });

  it("does not expose configEncrypted", async () => {
    mockRequireSession.mockResolvedValue(SESSION);
    const conn = { id: "c1", name: "DB", type: "neo4j", createdAt: new Date(), updatedAt: new Date() };
    mockDb.select.mockReturnValue(makeSelectChain([conn]));

    const res = await GET(makeRequest({}), makeParams("c1"));
    expect(res._body.data.configEncrypted).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// PATCH /api/connections/[id]
// ---------------------------------------------------------------------------

describe("PATCH /api/connections/[id]", () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let PATCH: (req: Request, ctx: { params: Promise<{ id: string }> }) => Promise<any>;

  beforeEach(async () => {
    vi.resetModules();
    vi.clearAllMocks();
    const mod = await import("../route");
    PATCH = mod.PATCH;
  });

  it("returns 401 when unauthenticated", async () => {
    mockRequireSession.mockRejectedValue(new Error("Unauthorized"));
    const res = await PATCH(makeRequest({ name: "New name" }), makeParams("c1"));
    expect(res.status).toBe(401);
  });

  it("returns 404 when connection not owned", async () => {
    mockRequireSession.mockResolvedValue(SESSION);
    mockDb.update.mockReturnValue(makeUpdateChain([]));
    const res = await PATCH(makeRequest({ name: "New name" }), makeParams("c1"));
    expect(res.status).toBe(404);
  });

  it("updates name and returns envelope", async () => {
    mockRequireSession.mockResolvedValue(SESSION);
    const updated = { id: "c1", name: "New name", type: "neo4j", updatedAt: new Date() };
    mockDb.update.mockReturnValue(makeUpdateChain([updated]));

    const res = await PATCH(makeRequest({ name: "New name" }), makeParams("c1"));
    expect(res.status).toBe(200);
    expect(res._body.data).toEqual(updated);
    expect(res._body.error).toBeNull();
  });

  it("re-encrypts config and triggers prefetch", async () => {
    mockRequireSession.mockResolvedValue(SESSION);
    const updated = { id: "c1", name: "Neo4j", type: "neo4j", updatedAt: new Date() };
    mockDb.update.mockReturnValue(makeUpdateChain([updated]));

    await PATCH(makeRequest({
      config: { uri: "bolt://new-host", username: "neo4j", password: "newpass" },
    }), makeParams("c1"));

    expect(mockEncryptJson).toHaveBeenCalledWith({ uri: "bolt://new-host", username: "neo4j", password: "newpass" });
    expect(mockPrefetchSchema).toHaveBeenCalledWith("neo4j", { uri: "bolt://new-host", username: "neo4j", password: "newpass" });
  });
});

// ---------------------------------------------------------------------------
// DELETE /api/connections/[id]
// ---------------------------------------------------------------------------

describe("DELETE /api/connections/[id]", () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let DELETE: (req: Request, ctx: { params: Promise<{ id: string }> }) => Promise<any>;

  beforeEach(async () => {
    vi.resetModules();
    vi.clearAllMocks();
    const mod = await import("../route");
    DELETE = mod.DELETE;
  });

  it("returns 401 when unauthenticated", async () => {
    mockRequireSession.mockRejectedValue(new Error("Unauthorized"));
    const res = await DELETE({} as Request, makeParams("c1"));
    expect(res.status).toBe(401);
  });

  it("returns 404 when connection not found", async () => {
    mockRequireSession.mockResolvedValue(SESSION);
    mockDb.delete.mockReturnValue(makeDeleteChain([]));
    const res = await DELETE({} as Request, makeParams("c1"));
    expect(res.status).toBe(404);
  });

  it("deletes and returns envelope", async () => {
    mockRequireSession.mockResolvedValue(SESSION);
    mockDb.delete.mockReturnValue(makeDeleteChain([{ id: "c1" }]));
    const res = await DELETE({} as Request, makeParams("c1"));
    expect(res.status).toBe(200);
    expect(res._body.data.deleted).toBe(true);
    expect(res._body.error).toBeNull();
  });
});
