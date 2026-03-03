import { describe, it, expect, vi, beforeEach } from "vitest";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockRequireAdmin = vi.fn<() => Promise<{ userId: string; canWrite: boolean; tenantId: string }>>();

function makeUpdateChain(returning: unknown[]) {
  const c = {
    set: () => c,
    where: () => c,
    returning: () => Promise.resolve(returning),
  };
  return c;
}

const mockDb = {
  update: vi.fn(),
  delete: vi.fn(),
};

vi.mock("@/lib/auth/session", () => ({ requireAdmin: mockRequireAdmin }));
vi.mock("@/lib/db", () => ({ db: mockDb }));
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

describe("PATCH /api/users/[id]", () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let PATCH: (req: Request, ctx: { params: Promise<{ id: string }> }) => Promise<any>;

  beforeEach(async () => {
    vi.resetModules();
    vi.clearAllMocks();
    vi.doMock("@/lib/auth/session", () => ({ requireAdmin: mockRequireAdmin }));
    vi.doMock("@/lib/db", () => ({ db: mockDb }));
    vi.doMock("next/server", () => ({
      NextResponse: {
        json: (body: unknown, init?: ResponseInit) => ({
          _body: body,
          status: init?.status ?? 200,
          json: async () => body,
        }),
      },
    }));
    const mod = await import("../route");
    PATCH = mod.PATCH;
  });

  it("returns 401 when unauthenticated", async () => {
    mockRequireAdmin.mockRejectedValue(new Error("Unauthorized"));
    const res = await PATCH(makeRequest({ canWrite: false }), makeParams("u1"));
    expect(res.status).toBe(401);
  });

  it("updates canWrite field and returns updated user", async () => {
    mockRequireAdmin.mockResolvedValue({ userId: "admin-1", canWrite: true, tenantId: "default" });
    const updated = { id: "u1", name: "Bob", email: "bob@example.com", role: "creator", canWrite: false, createdAt: new Date() };
    mockDb.update.mockReturnValue(makeUpdateChain([updated]));

    const res = await PATCH(makeRequest({ canWrite: false }), makeParams("u1"));

    expect(res.status).toBe(200);
    expect(res._body.canWrite).toBe(false);
  });

  it("updates both role and canWrite", async () => {
    mockRequireAdmin.mockResolvedValue({ userId: "admin-1", canWrite: true, tenantId: "default" });
    const updated = { id: "u2", name: "Eve", email: "eve@example.com", role: "creator", canWrite: false, createdAt: new Date() };
    mockDb.update.mockReturnValue(makeUpdateChain([updated]));

    const res = await PATCH(makeRequest({ role: "creator", canWrite: false }), makeParams("u2"));

    expect(res.status).toBe(200);
    expect(res._body.role).toBe("creator");
    expect(res._body.canWrite).toBe(false);
  });

  it("returns 400 when body is empty (no fields provided)", async () => {
    mockRequireAdmin.mockResolvedValue({ userId: "admin-1", canWrite: true, tenantId: "default" });

    const res = await PATCH(makeRequest({}), makeParams("u3"));

    expect(res.status).toBe(400);
  });

  it("returns 400 when self-editing", async () => {
    mockRequireAdmin.mockResolvedValue({ userId: "self-1", canWrite: true, tenantId: "default" });

    const res = await PATCH(makeRequest({ canWrite: false }), makeParams("self-1"));

    expect(res.status).toBe(400);
  });

  it("returns 404 when user not found", async () => {
    mockRequireAdmin.mockResolvedValue({ userId: "admin-1", canWrite: true, tenantId: "default" });
    mockDb.update.mockReturnValue(makeUpdateChain([]));

    const res = await PATCH(makeRequest({ canWrite: false }), makeParams("nonexistent"));

    expect(res.status).toBe(404);
  });
});
