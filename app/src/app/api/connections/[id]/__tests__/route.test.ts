import { describe, it, expect, vi, beforeEach } from "vitest";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockRequireUserId = vi.fn<() => Promise<string>>();
const mockEncryptJson = vi.fn((v: unknown) => `enc:${JSON.stringify(v)}`);
const mockPrefetchSchema = vi.fn();

function makeUpdateChain(returning: unknown[]) {
  const c = {
    set: () => c,
    where: () => c,
    returning: () => Promise.resolve(returning),
  };
  return c;
}

function makeDeleteChain(returning: unknown[]) {
  const c = {
    where: () => c,
    returning: () => Promise.resolve(returning),
  };
  return c;
}

const mockDb = {
  update: vi.fn(),
  delete: vi.fn(),
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
// Helpers
// ---------------------------------------------------------------------------

function makeRequest(body: unknown) {
  return { json: async () => body } as Request;
}

function makeParams(id: string) {
  return { params: Promise.resolve({ id }) };
}

// ---------------------------------------------------------------------------
// Tests
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
    mockRequireUserId.mockRejectedValue(new Error("Unauthorized"));
    const res = await PATCH(makeRequest({ name: "New name" }), makeParams("c1"));
    expect(res.status).toBe(401);
  });

  it("returns 404 when connection not owned", async () => {
    mockRequireUserId.mockResolvedValue("user-1");
    mockDb.update.mockReturnValue(makeUpdateChain([]));
    const res = await PATCH(makeRequest({ name: "New name" }), makeParams("c1"));
    expect(res.status).toBe(404);
  });

  it("updates name and returns 200", async () => {
    mockRequireUserId.mockResolvedValue("user-1");
    const updated = { id: "c1", name: "New name", type: "neo4j", updatedAt: new Date() };
    mockDb.update.mockReturnValue(makeUpdateChain([updated]));
    const res = await PATCH(makeRequest({ name: "New name" }), makeParams("c1"));
    expect(res.status).toBe(200);
    expect(res._body).toEqual(updated);
  });

  it("re-encrypts config and triggers prefetch when config is updated", async () => {
    mockRequireUserId.mockResolvedValue("user-1");
    const updated = { id: "c1", name: "Neo4j", type: "neo4j", updatedAt: new Date() };
    mockDb.update.mockReturnValue(makeUpdateChain([updated]));

    await PATCH(makeRequest({
      config: { uri: "bolt://new-host", username: "neo4j", password: "newpass" },
    }), makeParams("c1"));

    expect(mockEncryptJson).toHaveBeenCalledWith({ uri: "bolt://new-host", username: "neo4j", password: "newpass" });
    expect(mockPrefetchSchema).toHaveBeenCalledWith("neo4j", { uri: "bolt://new-host", username: "neo4j", password: "newpass" });
  });
});

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
    mockRequireUserId.mockRejectedValue(new Error("Unauthorized"));
    const res = await DELETE({} as Request, makeParams("c1"));
    expect(res.status).toBe(401);
  });

  it("returns 404 when connection not found / not owned", async () => {
    mockRequireUserId.mockResolvedValue("user-1");
    mockDb.delete.mockReturnValue(makeDeleteChain([]));
    const res = await DELETE({} as Request, makeParams("c1"));
    expect(res.status).toBe(404);
  });

  it("deletes connection and returns success", async () => {
    mockRequireUserId.mockResolvedValue("user-1");
    mockDb.delete.mockReturnValue(makeDeleteChain([{ id: "c1" }]));
    const res = await DELETE({} as Request, makeParams("c1"));
    expect(res.status).toBe(200);
    expect((res._body as { success: boolean }).success).toBe(true);
  });
});
