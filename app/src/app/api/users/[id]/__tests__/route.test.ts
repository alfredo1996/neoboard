import { describe, it, expect, vi, beforeEach } from "vitest";
import { makeSelectChain, makeUpdateChain } from "@/__tests__/helpers/drizzle-mocks";
import { makeRequest, makeParams } from "@/__tests__/helpers/request-helpers";
import { nextResponseMockFactory } from "@/__tests__/helpers/next-mocks";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockRequireAdmin = vi.fn<() => Promise<{ userId: string; canWrite: boolean; tenantId: string }>>();

const mockDb = {
  select: vi.fn(),
  update: vi.fn(),
  delete: vi.fn(),
};

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

vi.mock("@/lib/auth/session", () => ({ requireAdmin: mockRequireAdmin }));
vi.mock("@/lib/db", () => ({ db: mockDb }));
vi.mock("next/server", () => nextResponseMockFactory());

const ADMIN = { userId: "admin-1", canWrite: true, tenantId: "default" };
const READONLY_ADMIN = { userId: "admin-1", canWrite: false, tenantId: "default" };

// ---------------------------------------------------------------------------
// GET /api/users/[id]
// ---------------------------------------------------------------------------

describe("GET /api/users/[id]", () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let GET: (req: Request, ctx: { params: Promise<{ id: string }> }) => Promise<any>;

  beforeEach(async () => {
    vi.resetModules();
    vi.clearAllMocks();
    vi.doMock("@/lib/auth/session", () => ({ requireAdmin: mockRequireAdmin }));
    vi.doMock("@/lib/db", () => ({ db: mockDb }));
    vi.doMock("next/server", () => nextResponseMockFactory());
    const mod = await import("../route");
    GET = mod.GET;
  });

  it("returns 401 when unauthenticated", async () => {
    mockRequireAdmin.mockRejectedValue(new UnauthorizedError());
    const res = await GET(makeRequest({}), makeParams("u1"));
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error.code).toBe("UNAUTHORIZED");
  });

  it("returns single user in envelope", async () => {
    mockRequireAdmin.mockResolvedValue(ADMIN);
    const user = { id: "u1", name: "Alice", email: "alice@example.com", role: "creator", canWrite: true, createdAt: new Date() };
    mockDb.select.mockReturnValue(makeSelectChain([user]));

    const res = await GET(makeRequest({}), makeParams("u1"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.id).toBe("u1");
    expect(body.data.name).toBe("Alice");
    expect(body.error).toBeNull();
  });

  it("returns 404 when user not found", async () => {
    mockRequireAdmin.mockResolvedValue(ADMIN);
    mockDb.select.mockReturnValue(makeSelectChain([]));

    const res = await GET(makeRequest({}), makeParams("nonexistent"));
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error.code).toBe("NOT_FOUND");
  });
});

// ---------------------------------------------------------------------------
// PATCH /api/users/[id]
// ---------------------------------------------------------------------------

describe("PATCH /api/users/[id]", () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let PATCH: (req: Request, ctx: { params: Promise<{ id: string }> }) => Promise<any>;

  beforeEach(async () => {
    vi.resetModules();
    vi.clearAllMocks();
    vi.doMock("@/lib/auth/session", () => ({ requireAdmin: mockRequireAdmin }));
    vi.doMock("@/lib/db", () => ({ db: mockDb }));
    vi.doMock("next/server", () => nextResponseMockFactory());
    const mod = await import("../route");
    PATCH = mod.PATCH;
  });

  it("returns 401 when unauthenticated", async () => {
    mockRequireAdmin.mockRejectedValue(new UnauthorizedError());
    const res = await PATCH(makeRequest({ canWrite: false }), makeParams("u1"));
    expect(res.status).toBe(401);
  });

  it("updates canWrite field and returns envelope", async () => {
    mockRequireAdmin.mockResolvedValue(ADMIN);
    const updated = { id: "u1", name: "Bob", email: "bob@example.com", role: "creator", canWrite: false, createdAt: new Date() };
    mockDb.update.mockReturnValue(makeUpdateChain([updated]));

    const res = await PATCH(makeRequest({ canWrite: false }), makeParams("u1"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.canWrite).toBe(false);
    expect(body.error).toBeNull();
  });

  it("updates both role and canWrite", async () => {
    mockRequireAdmin.mockResolvedValue(ADMIN);
    const updated = { id: "u2", name: "Eve", email: "eve@example.com", role: "creator", canWrite: false, createdAt: new Date() };
    mockDb.update.mockReturnValue(makeUpdateChain([updated]));

    const res = await PATCH(makeRequest({ role: "creator", canWrite: false }), makeParams("u2"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.role).toBe("creator");
    expect(body.data.canWrite).toBe(false);
  });

  it("returns 400 when body is empty", async () => {
    mockRequireAdmin.mockResolvedValue(ADMIN);
    const res = await PATCH(makeRequest({}), makeParams("u3"));
    expect(res.status).toBe(400);
  });

  it("returns 400 when self-editing", async () => {
    mockRequireAdmin.mockResolvedValue(ADMIN);
    const res = await PATCH(makeRequest({ canWrite: false }), makeParams("admin-1"));
    expect(res.status).toBe(400);
  });

  it("returns 404 when user not found", async () => {
    mockRequireAdmin.mockResolvedValue(ADMIN);
    mockDb.update.mockReturnValue(makeUpdateChain([]));
    const res = await PATCH(makeRequest({ canWrite: false }), makeParams("nonexistent"));
    expect(res.status).toBe(404);
  });

  it("returns 403 when admin has canWrite=false", async () => {
    mockRequireAdmin.mockResolvedValue(READONLY_ADMIN);
    const res = await PATCH(makeRequest({ role: "reader" }), makeParams("u1"));
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error.message).toBe("Forbidden");
  });
});

// ---------------------------------------------------------------------------
// DELETE /api/users/[id]
// ---------------------------------------------------------------------------

describe("DELETE /api/users/[id]", () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let DELETE: (req: Request, ctx: { params: Promise<{ id: string }> }) => Promise<any>;

  beforeEach(async () => {
    vi.resetModules();
    vi.clearAllMocks();
    vi.doMock("@/lib/auth/session", () => ({ requireAdmin: mockRequireAdmin }));
    vi.doMock("@/lib/db", () => ({ db: mockDb }));
    vi.doMock("next/server", () => nextResponseMockFactory());
vi.mock("@/lib/auth/errors", () => ({ UnauthorizedError, ForbiddenError }));
    const mod = await import("../route");
    DELETE = mod.DELETE;
  });

  it("returns 401 when unauthenticated", async () => {
    mockRequireAdmin.mockRejectedValue(new UnauthorizedError());
    const res = await DELETE(makeRequest({}), makeParams("u1"));
    expect(res.status).toBe(401);
  });

  it("returns 403 when admin has canWrite=false", async () => {
    mockRequireAdmin.mockResolvedValue(READONLY_ADMIN);
    const res = await DELETE(makeRequest({}), makeParams("u1"));
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error.message).toBe("Forbidden");
  });

  it("returns 400 when self-deleting", async () => {
    mockRequireAdmin.mockResolvedValue(ADMIN);
    const res = await DELETE(makeRequest({}), makeParams("admin-1"));
    expect(res.status).toBe(400);
  });

  it("returns 404 when user not found", async () => {
    mockRequireAdmin.mockResolvedValue(ADMIN);
    mockDb.delete.mockReturnValue({
      where: () => ({ returning: () => Promise.resolve([]) }),
    });
    const res = await DELETE(makeRequest({}), makeParams("nonexistent"));
    expect(res.status).toBe(404);
  });

  it("deletes user and returns envelope", async () => {
    mockRequireAdmin.mockResolvedValue(ADMIN);
    mockDb.delete.mockReturnValue({
      where: () => ({ returning: () => Promise.resolve([{ id: "u1" }]) }),
    });
    const res = await DELETE(makeRequest({}), makeParams("u1"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.deleted).toBe(true);
    expect(body.error).toBeNull();
  });
});
