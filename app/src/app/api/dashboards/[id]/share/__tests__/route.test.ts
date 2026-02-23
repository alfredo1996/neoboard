import { describe, it, expect, vi, beforeEach } from "vitest";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockRequireSession = vi.fn<
  () => Promise<{ userId: string; role: string; canWrite: boolean; tenantId: string }>
>();

function makeSelectChain(rows: unknown[]) {
  const resolved = Promise.resolve(rows);
  const c = Object.assign(resolved, {
    from: () => c,
    where: () => c,
    innerJoin: () => c,
    limit: () => Promise.resolve(rows),
  });
  return c;
}

function makeInsertChain() {
  return { values: () => Promise.resolve() };
}

function makeUpdateChain() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const c: any = { set: () => c, where: () => Promise.resolve() };
  return c;
}

function makeDeleteChain() {
  return { where: () => Promise.resolve() };
}

const mockDb = {
  select: vi.fn(),
  insert: vi.fn(),
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

function makeParams(id: string) {
  return { params: Promise.resolve({ id }) };
}

function makeRequest(body: unknown, url = "http://localhost/api/dashboards/d1/share") {
  return { json: async () => body, url } as Request;
}

function makeDeleteRequest(url: string) {
  return { url } as Request;
}

const SESSION = { userId: "user-1", role: "creator", canWrite: true, tenantId: "default" };
const ADMIN_SESSION = { userId: "admin-1", role: "admin", canWrite: true, tenantId: "default" };
const DASHBOARD = { id: "d1", userId: "user-1", tenantId: "default", name: "Dash" };

// ---------------------------------------------------------------------------
// GET
// ---------------------------------------------------------------------------

describe("GET /api/dashboards/[id]/share", () => {
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
    mockDb.select.mockReturnValueOnce(makeSelectChain([]));
    const res = await GET({} as Request, makeParams("d1"));
    expect(res.status).toBe(404);
  });

  it("returns shares for dashboard owner", async () => {
    mockRequireSession.mockResolvedValue(SESSION);
    mockDb.select.mockReturnValueOnce(makeSelectChain([DASHBOARD]));
    const shares = [
      { id: "s1", role: "viewer", createdAt: new Date(), userName: "Alice", userEmail: "alice@example.com" },
    ];
    mockDb.select.mockReturnValueOnce(makeSelectChain(shares));
    const res = await GET({} as Request, makeParams("d1"));
    expect(res.status).toBe(200);
    const body = res._body as unknown[];
    expect(body).toHaveLength(1);
  });

  it("returns shares for admin accessing any dashboard", async () => {
    mockRequireSession.mockResolvedValue(ADMIN_SESSION);
    mockDb.select.mockReturnValueOnce(makeSelectChain([{ ...DASHBOARD, userId: "someone-else" }]));
    mockDb.select.mockReturnValueOnce(makeSelectChain([]));
    const res = await GET({} as Request, makeParams("d1"));
    expect(res.status).toBe(200);
    expect(res._body).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// POST
// ---------------------------------------------------------------------------

describe("POST /api/dashboards/[id]/share", () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let POST: (req: Request, ctx: { params: Promise<{ id: string }> }) => Promise<any>;

  beforeEach(async () => {
    vi.resetModules();
    vi.clearAllMocks();
    const mod = await import("../route");
    POST = mod.POST;
  });

  it("returns 401 when unauthenticated", async () => {
    mockRequireSession.mockRejectedValue(new Error("Unauthorized"));
    const res = await POST(makeRequest({ email: "a@b.com", role: "viewer" }), makeParams("d1"));
    expect(res.status).toBe(401);
  });

  it("returns 404 when dashboard not found", async () => {
    mockRequireSession.mockResolvedValue(SESSION);
    mockDb.select.mockReturnValueOnce(makeSelectChain([]));
    const res = await POST(makeRequest({ email: "a@b.com", role: "viewer" }), makeParams("d1"));
    expect(res.status).toBe(404);
  });

  it("returns 400 when email is invalid", async () => {
    mockRequireSession.mockResolvedValue(SESSION);
    mockDb.select.mockReturnValueOnce(makeSelectChain([DASHBOARD]));
    const res = await POST(makeRequest({ email: "not-an-email", role: "viewer" }), makeParams("d1"));
    expect(res.status).toBe(400);
  });

  it("returns 400 when role is invalid", async () => {
    mockRequireSession.mockResolvedValue(SESSION);
    mockDb.select.mockReturnValueOnce(makeSelectChain([DASHBOARD]));
    const res = await POST(makeRequest({ email: "a@b.com", role: "owner" }), makeParams("d1"));
    expect(res.status).toBe(400);
  });

  it("returns 404 when target user not found", async () => {
    mockRequireSession.mockResolvedValue(SESSION);
    mockDb.select.mockReturnValueOnce(makeSelectChain([DASHBOARD]));
    mockDb.select.mockReturnValueOnce(makeSelectChain([]));
    const res = await POST(makeRequest({ email: "unknown@example.com", role: "viewer" }), makeParams("d1"));
    expect(res.status).toBe(404);
    expect((res._body as { error: string }).error).toBe("User not found");
  });

  it("returns 400 when sharing with yourself", async () => {
    mockRequireSession.mockResolvedValue(SESSION);
    mockDb.select.mockReturnValueOnce(makeSelectChain([DASHBOARD]));
    mockDb.select.mockReturnValueOnce(makeSelectChain([{ id: "user-1" }]));
    const res = await POST(makeRequest({ email: "self@example.com", role: "viewer" }), makeParams("d1"));
    expect(res.status).toBe(400);
    expect((res._body as { error: string }).error).toBe("Cannot share with yourself");
  });

  it("creates new share when none exists", async () => {
    mockRequireSession.mockResolvedValue(SESSION);
    mockDb.select.mockReturnValueOnce(makeSelectChain([DASHBOARD]));
    mockDb.select.mockReturnValueOnce(makeSelectChain([{ id: "user-2" }]));
    mockDb.select.mockReturnValueOnce(makeSelectChain([]));
    mockDb.insert.mockReturnValue(makeInsertChain());
    const res = await POST(makeRequest({ email: "other@example.com", role: "viewer" }), makeParams("d1"));
    expect(res.status).toBe(201);
    expect((res._body as { success: boolean }).success).toBe(true);
  });

  it("updates existing share role (upsert)", async () => {
    mockRequireSession.mockResolvedValue(SESSION);
    mockDb.select.mockReturnValueOnce(makeSelectChain([DASHBOARD]));
    mockDb.select.mockReturnValueOnce(makeSelectChain([{ id: "user-2" }]));
    mockDb.select.mockReturnValueOnce(
      makeSelectChain([{ id: "s1", dashboardId: "d1", userId: "user-2", role: "viewer" }])
    );
    mockDb.update.mockReturnValue(makeUpdateChain());
    const res = await POST(makeRequest({ email: "other@example.com", role: "editor" }), makeParams("d1"));
    expect(res.status).toBe(201);
    expect((res._body as { success: boolean }).success).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// DELETE
// ---------------------------------------------------------------------------

describe("DELETE /api/dashboards/[id]/share", () => {
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
    const res = await DELETE(
      makeDeleteRequest("http://localhost/api/dashboards/d1/share"),
      makeParams("d1")
    );
    expect(res.status).toBe(401);
  });

  it("returns 404 when dashboard not found", async () => {
    mockRequireSession.mockResolvedValue(SESSION);
    mockDb.select.mockReturnValueOnce(makeSelectChain([]));
    const res = await DELETE(
      makeDeleteRequest("http://localhost/api/dashboards/d1/share"),
      makeParams("d1")
    );
    expect(res.status).toBe(404);
  });

  it("returns 400 when shareId is missing", async () => {
    mockRequireSession.mockResolvedValue(SESSION);
    mockDb.select.mockReturnValueOnce(makeSelectChain([DASHBOARD]));
    const res = await DELETE(
      makeDeleteRequest("http://localhost/api/dashboards/d1/share"),
      makeParams("d1")
    );
    expect(res.status).toBe(400);
  });

  it("deletes share and returns success", async () => {
    mockRequireSession.mockResolvedValue(SESSION);
    mockDb.select.mockReturnValueOnce(makeSelectChain([DASHBOARD]));
    mockDb.delete.mockReturnValue(makeDeleteChain());
    const res = await DELETE(
      makeDeleteRequest("http://localhost/api/dashboards/d1/share?shareId=s1"),
      makeParams("d1")
    );
    expect(res.status).toBe(200);
    expect((res._body as { success: boolean }).success).toBe(true);
  });
});
