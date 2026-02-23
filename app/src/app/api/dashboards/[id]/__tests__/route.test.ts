import { describe, it, expect, vi, beforeEach } from "vitest";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockRequireSession = vi.fn<
  () => Promise<{ userId: string; tenantId: string; canWrite: boolean; role: string }>
>();

function makeSelectChain(rows: unknown[]) {
  const c: Record<string, unknown> = {};
  c.from = () => c;
  c.where = () => c;
  c.innerJoin = () => c;
  c.limit = () => Promise.resolve(rows);
  c.then = (resolve: (v: unknown[]) => unknown) =>
    Promise.resolve(rows).then(resolve);
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
    where: () => Promise.resolve(),
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
// Helpers
// ---------------------------------------------------------------------------

function makeRequest(body: unknown) {
  return { json: async () => body } as Request;
}

function makeParams(id: string) {
  return { params: Promise.resolve({ id }) };
}

const SESSION = { userId: "user-1", tenantId: "tenant-1", canWrite: true, role: "creator" };

const OWNER_DASHBOARD = {
  id: "d1",
  name: "Dashboard",
  userId: "user-1",
  tenantId: "tenant-1",
  description: null,
  isPublic: false,
  layoutJson: null,
  createdAt: new Date(),
  updatedAt: new Date(),
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("GET /api/dashboards/[id]", () => {
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
    const res = await GET({} as Request, makeParams("d1"));
    expect(res.status).toBe(401);
  });

  it("returns 404 when dashboard not found", async () => {
    mockRequireSession.mockResolvedValue(SESSION);
    mockDb.select.mockReturnValue(makeSelectChain([]));
    const res = await GET({} as Request, makeParams("d1"));
    expect(res.status).toBe(404);
  });

  it("returns dashboard for owner", async () => {
    mockRequireSession.mockResolvedValue(SESSION);
    mockDb.select.mockReturnValue(makeSelectChain([OWNER_DASHBOARD]));
    const res = await GET({} as Request, makeParams("d1"));
    expect(res.status).toBe(200);
    const body = res._body as { id: string; role: string };
    expect(body.id).toBe("d1");
    expect(body.role).toBe("owner");
  });

  it("returns dashboard for shared viewer", async () => {
    mockRequireSession.mockResolvedValue({ ...SESSION, userId: "user-2" });
    const sharedDashboard = { ...OWNER_DASHBOARD, userId: "user-1" };
    const share = { dashboardId: "d1", userId: "user-2", tenantId: "tenant-1", role: "viewer" };
    mockDb.select
      .mockReturnValueOnce(makeSelectChain([sharedDashboard]))
      .mockReturnValueOnce(makeSelectChain([share]));
    const res = await GET({} as Request, makeParams("d1"));
    expect(res.status).toBe(200);
    const body = res._body as { id: string; role: string };
    expect(body.role).toBe("viewer");
  });

  it("returns 404 when user has no access", async () => {
    mockRequireSession.mockResolvedValue({ ...SESSION, userId: "user-2" });
    const otherDashboard = { ...OWNER_DASHBOARD, userId: "user-1" };
    mockDb.select
      .mockReturnValueOnce(makeSelectChain([otherDashboard]))
      .mockReturnValueOnce(makeSelectChain([]));
    const res = await GET({} as Request, makeParams("d1"));
    expect(res.status).toBe(404);
  });

  it("returns 404 when dashboard belongs to different tenant", async () => {
    mockRequireSession.mockResolvedValue({ ...SESSION, tenantId: "tenant-other" });
    mockDb.select.mockReturnValue(makeSelectChain([]));
    const res = await GET({} as Request, makeParams("d1"));
    expect(res.status).toBe(404);
  });

  it("returns dashboard for admin (bypasses per-dashboard ACL)", async () => {
    mockRequireSession.mockResolvedValue({ ...SESSION, userId: "admin-1", role: "admin" });
    mockDb.select.mockReturnValue(makeSelectChain([OWNER_DASHBOARD]));
    const res = await GET({} as Request, makeParams("d1"));
    expect(res.status).toBe(200);
    const body = res._body as { role: string };
    expect(body.role).toBe("admin");
  });
});

describe("PUT /api/dashboards/[id]", () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let PUT: (req: Request, ctx: { params: Promise<{ id: string }> }) => Promise<any>;

  beforeEach(async () => {
    vi.resetModules();
    vi.clearAllMocks();
    const mod = await import("../route");
    PUT = mod.PUT;
  });

  it("returns 401 when unauthenticated", async () => {
    mockRequireSession.mockRejectedValue(new Error("Unauthorized"));
    const res = await PUT(makeRequest({ name: "New name" }), makeParams("d1"));
    expect(res.status).toBe(401);
  });

  it("returns 403 for reader role", async () => {
    mockRequireSession.mockResolvedValue({ ...SESSION, canWrite: false, role: "reader" });
    const res = await PUT(makeRequest({ name: "New name" }), makeParams("d1"));
    expect(res.status).toBe(403);
  });

  it("returns 404 when not owner/editor", async () => {
    mockRequireSession.mockResolvedValue(SESSION);
    mockDb.select.mockReturnValue(makeSelectChain([]));
    const res = await PUT(makeRequest({ name: "New name" }), makeParams("d1"));
    expect(res.status).toBe(404);
  });

  it("updates dashboard and returns 200", async () => {
    mockRequireSession.mockResolvedValue(SESSION);
    mockDb.select.mockReturnValue(makeSelectChain([OWNER_DASHBOARD]));
    const updated = { ...OWNER_DASHBOARD, name: "New name" };
    mockDb.update.mockReturnValue(makeUpdateChain([updated]));

    const res = await PUT(makeRequest({ name: "New name" }), makeParams("d1"));
    expect(res.status).toBe(200);
    expect((res._body as { name: string }).name).toBe("New name");
  });

  it("returns 400 when request body is invalid", async () => {
    mockRequireSession.mockResolvedValue(SESSION);
    mockDb.select.mockReturnValue(makeSelectChain([OWNER_DASHBOARD]));
    const res = await PUT(makeRequest({ name: "" }), makeParams("d1"));
    expect(res.status).toBe(400);
  });

  it("updates layout with v2 pages schema", async () => {
    mockRequireSession.mockResolvedValue(SESSION);
    mockDb.select.mockReturnValue(makeSelectChain([OWNER_DASHBOARD]));
    const layout = {
      version: 2,
      pages: [
        {
          id: "p1",
          title: "Page 1",
          widgets: [
            {
              id: "w1",
              chartType: "bar",
              connectionId: "c1",
              query: "MATCH (n) RETURN n",
            },
          ],
          gridLayout: [{ i: "w1", x: 0, y: 0, w: 4, h: 3 }],
        },
      ],
    };
    const updated = { ...OWNER_DASHBOARD, layoutJson: layout };
    mockDb.update.mockReturnValue(makeUpdateChain([updated]));
    const res = await PUT(makeRequest({ layoutJson: layout }), makeParams("d1"));
    expect(res.status).toBe(200);
  });
});

describe("DELETE /api/dashboards/[id]", () => {
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
    const res = await DELETE({} as Request, makeParams("d1"));
    expect(res.status).toBe(401);
  });

  it("returns 403 for reader role", async () => {
    mockRequireSession.mockResolvedValue({ ...SESSION, canWrite: false, role: "reader" });
    const res = await DELETE({} as Request, makeParams("d1"));
    expect(res.status).toBe(403);
  });

  it("returns 404 when not owner (creator role)", async () => {
    mockRequireSession.mockResolvedValue(SESSION);
    mockDb.select.mockReturnValue(makeSelectChain([]));
    const res = await DELETE({} as Request, makeParams("d1"));
    expect(res.status).toBe(404);
  });

  it("deletes dashboard and returns success", async () => {
    mockRequireSession.mockResolvedValue(SESSION);
    mockDb.select.mockReturnValue(makeSelectChain([OWNER_DASHBOARD]));
    mockDb.delete.mockReturnValue(makeDeleteChain());
    const res = await DELETE({} as Request, makeParams("d1"));
    expect(res.status).toBe(200);
    expect((res._body as { success: boolean }).success).toBe(true);
  });

  it("returns 404 when dashboard belongs to different tenant", async () => {
    mockRequireSession.mockResolvedValue({ ...SESSION, tenantId: "tenant-other" });
    mockDb.select.mockReturnValue(makeSelectChain([]));
    const res = await DELETE({} as Request, makeParams("d1"));
    expect(res.status).toBe(404);
  });

  it("allows admin to delete any dashboard in the tenant", async () => {
    mockRequireSession.mockResolvedValue({ ...SESSION, userId: "admin-1", role: "admin" });
    mockDb.select.mockReturnValue(makeSelectChain([{ id: "d1" }]));
    mockDb.delete.mockReturnValue(makeDeleteChain());
    const res = await DELETE({} as Request, makeParams("d1"));
    expect(res.status).toBe(200);
  });
});
