import { describe, it, expect, vi, beforeEach } from "vitest";
import { makeSelectChain, makeUpdateChain, makeDeleteChain } from "@/__tests__/helpers/drizzle-mocks";
import { nextResponseMockFactory } from "@/__tests__/helpers/next-mocks";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockRequireSession = vi.fn<
  () => Promise<{ userId: string; role: string; canWrite: boolean; tenantId: string }>
>();

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

vi.mock("@/lib/auth/session", () => ({
  requireSession: mockRequireSession,
  requireUserId: vi.fn(),
}));
vi.mock("@/lib/db", () => ({ db: mockDb }));
vi.mock("next/server", () => nextResponseMockFactory());
vi.mock("@/lib/auth/errors", () => ({ UnauthorizedError, ForbiddenError }));

// ---------------------------------------------------------------------------
// Tests — GET /api/widget-templates/[id]
// ---------------------------------------------------------------------------

describe("GET /api/widget-templates/[id]", () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let GET: (req: Request, ctx: { params: Promise<{ id: string }> }) => Promise<any>;

  beforeEach(async () => {
    vi.resetModules();
    vi.clearAllMocks();
    const mod = await import("../route");
    GET = mod.GET;
  });

  it("returns 401 when unauthenticated", async () => {
    mockRequireSession.mockRejectedValue(new UnauthorizedError());
    const res = await GET({} as Request, { params: Promise.resolve({ id: "t1" }) });
    expect(res.status).toBe(401);
  });

  it("returns 404 when template not found", async () => {
    mockRequireSession.mockResolvedValue({ userId: "user-1", role: "creator", canWrite: true, tenantId: "default" });
    mockDb.select.mockReturnValue(makeSelectChain([]));
    const res = await GET({} as Request, { params: Promise.resolve({ id: "missing" }) });
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error.message).toBe("Not found");
  });

  it("returns template wrapped in envelope when found", async () => {
    mockRequireSession.mockResolvedValue({ userId: "user-1", role: "creator", canWrite: true, tenantId: "default" });
    const template = { id: "t1", name: "My Template", chartType: "bar", connectorType: "neo4j", createdBy: "user-1" };
    mockDb.select.mockReturnValue(makeSelectChain([template]));
    const res = await GET({} as Request, { params: Promise.resolve({ id: "t1" }) });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data).toEqual(template);
    expect(body.error).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Tests — PUT /api/widget-templates/[id]
// ---------------------------------------------------------------------------

describe("PUT /api/widget-templates/[id]", () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let PUT: (req: Request, ctx: { params: Promise<{ id: string }> }) => Promise<any>;

  beforeEach(async () => {
    vi.resetModules();
    vi.clearAllMocks();
    const mod = await import("../route");
    PUT = mod.PUT;
  });

  function makeRequest(body: unknown) {
    return { json: async () => body } as Request;
  }

  it("returns 401 when unauthenticated", async () => {
    mockRequireSession.mockRejectedValue(new UnauthorizedError());
    const res = await PUT(makeRequest({ name: "Updated" }), { params: Promise.resolve({ id: "t1" }) });
    expect(res.status).toBe(401);
  });

  it("returns 403 when user cannot write", async () => {
    mockRequireSession.mockResolvedValue({ userId: "user-1", role: "creator", canWrite: false, tenantId: "default" });
    const res = await PUT(makeRequest({ name: "Updated" }), { params: Promise.resolve({ id: "t1" }) });
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error.message).toBe("Forbidden");
  });

  it("returns 404 when template not found", async () => {
    mockRequireSession.mockResolvedValue({ userId: "user-1", role: "creator", canWrite: true, tenantId: "default" });
    mockDb.select.mockReturnValue(makeSelectChain([]));
    const res = await PUT(makeRequest({ name: "Updated" }), { params: Promise.resolve({ id: "missing" }) });
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error.message).toBe("Not found");
  });

  it("returns 403 when user is not the creator and not admin", async () => {
    mockRequireSession.mockResolvedValue({ userId: "user-2", role: "creator", canWrite: true, tenantId: "default" });
    const existing = { id: "t1", name: "Old", createdBy: "user-1", tenantId: "default" };
    mockDb.select.mockReturnValue(makeSelectChain([existing]));
    const res = await PUT(makeRequest({ name: "Updated" }), { params: Promise.resolve({ id: "t1" }) });
    expect(res.status).toBe(403);
  });

  it("allows admin to update any template", async () => {
    mockRequireSession.mockResolvedValue({ userId: "user-2", role: "admin", canWrite: true, tenantId: "default" });
    const existing = { id: "t1", name: "Old", createdBy: "user-1", tenantId: "default" };
    const updated = { ...existing, name: "Updated" };
    mockDb.select.mockReturnValue(makeSelectChain([existing]));
    mockDb.update.mockReturnValue(makeUpdateChain([updated]));
    const res = await PUT(makeRequest({ name: "Updated" }), { params: Promise.resolve({ id: "t1" }) });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data).toEqual(updated);
    expect(body.error).toBeNull();
  });

  it("allows creator to update own template", async () => {
    mockRequireSession.mockResolvedValue({ userId: "user-1", role: "creator", canWrite: true, tenantId: "default" });
    const existing = { id: "t1", name: "Old", createdBy: "user-1", tenantId: "default" };
    const updated = { ...existing, name: "Updated" };
    mockDb.select.mockReturnValue(makeSelectChain([existing]));
    mockDb.update.mockReturnValue(makeUpdateChain([updated]));
    const res = await PUT(makeRequest({ name: "Updated" }), { params: Promise.resolve({ id: "t1" }) });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data).toEqual(updated);
  });
});

// ---------------------------------------------------------------------------
// Tests — DELETE /api/widget-templates/[id]
// ---------------------------------------------------------------------------

describe("DELETE /api/widget-templates/[id]", () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let DELETE: (req: Request, ctx: { params: Promise<{ id: string }> }) => Promise<any>;

  beforeEach(async () => {
    vi.resetModules();
    vi.clearAllMocks();
    const mod = await import("../route");
    DELETE = mod.DELETE;
  });

  it("returns 401 when unauthenticated", async () => {
    mockRequireSession.mockRejectedValue(new UnauthorizedError());
    const res = await DELETE({} as Request, { params: Promise.resolve({ id: "t1" }) });
    expect(res.status).toBe(401);
  });

  it("returns 403 when user cannot write", async () => {
    mockRequireSession.mockResolvedValue({ userId: "user-1", role: "creator", canWrite: false, tenantId: "default" });
    const res = await DELETE({} as Request, { params: Promise.resolve({ id: "t1" }) });
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error.message).toBe("Forbidden");
  });

  it("returns 404 when template not found", async () => {
    mockRequireSession.mockResolvedValue({ userId: "user-1", role: "creator", canWrite: true, tenantId: "default" });
    mockDb.select.mockReturnValue(makeSelectChain([]));
    const res = await DELETE({} as Request, { params: Promise.resolve({ id: "missing" }) });
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error.message).toBe("Not found");
  });

  it("returns 403 when user is not the creator and not admin", async () => {
    mockRequireSession.mockResolvedValue({ userId: "user-2", role: "creator", canWrite: true, tenantId: "default" });
    const existing = { id: "t1", name: "My Template", createdBy: "user-1", tenantId: "default" };
    mockDb.select.mockReturnValue(makeSelectChain([existing]));
    const res = await DELETE({} as Request, { params: Promise.resolve({ id: "t1" }) });
    expect(res.status).toBe(403);
  });

  it("deletes template and returns { deleted: true } in envelope", async () => {
    mockRequireSession.mockResolvedValue({ userId: "user-1", role: "creator", canWrite: true, tenantId: "default" });
    const existing = { id: "t1", name: "My Template", createdBy: "user-1", tenantId: "default" };
    mockDb.select.mockReturnValue(makeSelectChain([existing]));
    mockDb.delete.mockReturnValue(makeDeleteChain());
    const res = await DELETE({} as Request, { params: Promise.resolve({ id: "t1" }) });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data).toEqual({ deleted: true });
    expect(body.error).toBeNull();
  });

  it("allows admin to delete any template", async () => {
    mockRequireSession.mockResolvedValue({ userId: "user-2", role: "admin", canWrite: true, tenantId: "default" });
    const existing = { id: "t1", name: "My Template", createdBy: "user-1", tenantId: "default" };
    mockDb.select.mockReturnValue(makeSelectChain([existing]));
    mockDb.delete.mockReturnValue(makeDeleteChain());
    const res = await DELETE({} as Request, { params: Promise.resolve({ id: "t1" }) });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data).toEqual({ deleted: true });
  });
});
