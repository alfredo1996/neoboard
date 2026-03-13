import { describe, it, expect, vi, beforeEach } from "vitest";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockRequireSession = vi.fn<
  () => Promise<{ userId: string; role: string; canWrite: boolean; tenantId: string }>
>();

function makeSelectChain(rows: unknown[]) {
  const limit = () => Promise.resolve(rows);
  const where = () => Object.assign(Promise.resolve(rows), { limit, where, orderBy: () => Promise.resolve(rows) });
  const c = Object.assign(Promise.resolve(rows), {
    from: () => c,
    where,
    orderBy: () => c,
    limit,
  });
  return c;
}

function makeUpdateChain(returning: unknown[]) {
  const c = {
    set: () => c,
    where: () => c,
    returning: () => Promise.resolve(returning),
  };
  return c;
}

function makeDeleteChain() {
  const c = {
    where: () => Promise.resolve(undefined),
  };
  return c;
}

const mockDb = {
  select: vi.fn(),
  update: vi.fn(),
  delete: vi.fn(),
};

vi.mock("@/lib/auth/session", () => ({
  requireSession: mockRequireSession,
  requireUserId: vi.fn(),
}));
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
// Tests — GET /api/widget-templates/[id]
// ---------------------------------------------------------------------------

describe("GET /api/widget-templates/[id]", () => {
  // any: mocked NextResponse shape exposes _body and status which are not in the real type
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
    const res = await GET({} as Request, { params: Promise.resolve({ id: "t1" }) });
    expect(res.status).toBe(401);
  });

  it("returns 404 when template not found", async () => {
    mockRequireSession.mockResolvedValue({ userId: "user-1", role: "creator", canWrite: true, tenantId: "default" });
    mockDb.select.mockReturnValue(makeSelectChain([]));
    const res = await GET({} as Request, { params: Promise.resolve({ id: "missing" }) });
    expect(res.status).toBe(404);
    expect(res._body.error.message).toBe("Not found");
  });

  it("returns template wrapped in envelope when found", async () => {
    mockRequireSession.mockResolvedValue({ userId: "user-1", role: "creator", canWrite: true, tenantId: "default" });
    const template = { id: "t1", name: "My Template", chartType: "bar", connectorType: "neo4j", createdBy: "user-1" };
    mockDb.select.mockReturnValue(makeSelectChain([template]));
    const res = await GET({} as Request, { params: Promise.resolve({ id: "t1" }) });
    expect(res.status).toBe(200);
    expect(res._body.data).toEqual(template);
    expect(res._body.error).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Tests — PUT /api/widget-templates/[id]
// ---------------------------------------------------------------------------

describe("PUT /api/widget-templates/[id]", () => {
  // any: mocked NextResponse shape exposes _body and status which are not in the real type
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
    mockRequireSession.mockRejectedValue(new Error("Unauthorized"));
    const res = await PUT(makeRequest({ name: "Updated" }), { params: Promise.resolve({ id: "t1" }) });
    expect(res.status).toBe(401);
  });

  it("returns 403 when user cannot write", async () => {
    mockRequireSession.mockResolvedValue({ userId: "user-1", role: "creator", canWrite: false, tenantId: "default" });
    const res = await PUT(makeRequest({ name: "Updated" }), { params: Promise.resolve({ id: "t1" }) });
    expect(res.status).toBe(403);
    expect(res._body.error.message).toBe("Forbidden");
  });

  it("returns 404 when template not found", async () => {
    mockRequireSession.mockResolvedValue({ userId: "user-1", role: "creator", canWrite: true, tenantId: "default" });
    mockDb.select.mockReturnValue(makeSelectChain([]));
    const res = await PUT(makeRequest({ name: "Updated" }), { params: Promise.resolve({ id: "missing" }) });
    expect(res.status).toBe(404);
    expect(res._body.error.message).toBe("Not found");
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
    expect(res._body.data).toEqual(updated);
    expect(res._body.error).toBeNull();
  });

  it("allows creator to update own template", async () => {
    mockRequireSession.mockResolvedValue({ userId: "user-1", role: "creator", canWrite: true, tenantId: "default" });
    const existing = { id: "t1", name: "Old", createdBy: "user-1", tenantId: "default" };
    const updated = { ...existing, name: "Updated" };
    mockDb.select.mockReturnValue(makeSelectChain([existing]));
    mockDb.update.mockReturnValue(makeUpdateChain([updated]));
    const res = await PUT(makeRequest({ name: "Updated" }), { params: Promise.resolve({ id: "t1" }) });
    expect(res.status).toBe(200);
    expect(res._body.data).toEqual(updated);
  });
});

// ---------------------------------------------------------------------------
// Tests — DELETE /api/widget-templates/[id]
// ---------------------------------------------------------------------------

describe("DELETE /api/widget-templates/[id]", () => {
  // any: mocked NextResponse shape exposes _body and status which are not in the real type
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
    const res = await DELETE({} as Request, { params: Promise.resolve({ id: "t1" }) });
    expect(res.status).toBe(401);
  });

  it("returns 403 when user cannot write", async () => {
    mockRequireSession.mockResolvedValue({ userId: "user-1", role: "creator", canWrite: false, tenantId: "default" });
    const res = await DELETE({} as Request, { params: Promise.resolve({ id: "t1" }) });
    expect(res.status).toBe(403);
    expect(res._body.error.message).toBe("Forbidden");
  });

  it("returns 404 when template not found", async () => {
    mockRequireSession.mockResolvedValue({ userId: "user-1", role: "creator", canWrite: true, tenantId: "default" });
    mockDb.select.mockReturnValue(makeSelectChain([]));
    const res = await DELETE({} as Request, { params: Promise.resolve({ id: "missing" }) });
    expect(res.status).toBe(404);
    expect(res._body.error.message).toBe("Not found");
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
    expect(res._body.data).toEqual({ deleted: true });
    expect(res._body.error).toBeNull();
  });

  it("allows admin to delete any template", async () => {
    mockRequireSession.mockResolvedValue({ userId: "user-2", role: "admin", canWrite: true, tenantId: "default" });
    const existing = { id: "t1", name: "My Template", createdBy: "user-1", tenantId: "default" };
    mockDb.select.mockReturnValue(makeSelectChain([existing]));
    mockDb.delete.mockReturnValue(makeDeleteChain());
    const res = await DELETE({} as Request, { params: Promise.resolve({ id: "t1" }) });
    expect(res.status).toBe(200);
    expect(res._body.data).toEqual({ deleted: true });
  });
});
