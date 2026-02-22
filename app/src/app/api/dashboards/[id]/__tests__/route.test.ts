import { describe, it, expect, vi, beforeEach } from "vitest";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockRequireUserId = vi.fn<() => Promise<string>>();

function makeSelectChain(rows: unknown[]) {
  const c: Record<string, unknown> = {};
  c.from = () => c;
  c.where = () => c;
  c.innerJoin = () => c;
  c.limit = () => Promise.resolve(rows);
  c.then = (resolve: (v: unknown[]) => unknown) => Promise.resolve(rows).then(resolve);
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

vi.mock("@/lib/auth/session", () => ({ requireUserId: mockRequireUserId }));
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

const OWNER_DASHBOARD = {
  id: "d1",
  name: "Dashboard",
  userId: "user-1",
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
    mockRequireUserId.mockRejectedValue(new Error("Unauthorized"));
    const res = await GET({} as Request, makeParams("d1"));
    expect(res.status).toBe(401);
  });

  it("returns 404 when dashboard not found", async () => {
    mockRequireUserId.mockResolvedValue("user-1");
    // canAccess: dashboard not found → empty
    mockDb.select.mockReturnValue(makeSelectChain([]));
    const res = await GET({} as Request, makeParams("d1"));
    expect(res.status).toBe(404);
  });

  it("returns dashboard for owner", async () => {
    mockRequireUserId.mockResolvedValue("user-1");
    // canAccess: dashboard found, userId matches → owner
    mockDb.select.mockReturnValue(makeSelectChain([OWNER_DASHBOARD]));
    const res = await GET({} as Request, makeParams("d1"));
    expect(res.status).toBe(200);
    const body = res._body as { id: string; role: string };
    expect(body.id).toBe("d1");
    expect(body.role).toBe("owner");
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
    mockRequireUserId.mockRejectedValue(new Error("Unauthorized"));
    const res = await PUT(makeRequest({ name: "New name" }), makeParams("d1"));
    expect(res.status).toBe(401);
  });

  it("returns 404 when not owner/editor", async () => {
    mockRequireUserId.mockResolvedValue("user-1");
    mockDb.select.mockReturnValue(makeSelectChain([]));
    const res = await PUT(makeRequest({ name: "New name" }), makeParams("d1"));
    expect(res.status).toBe(404);
  });

  it("updates dashboard and returns 200", async () => {
    mockRequireUserId.mockResolvedValue("user-1");
    // canAccess: dashboard found
    mockDb.select.mockReturnValue(makeSelectChain([OWNER_DASHBOARD]));
    const updated = { ...OWNER_DASHBOARD, name: "New name" };
    mockDb.update.mockReturnValue(makeUpdateChain([updated]));

    const res = await PUT(makeRequest({ name: "New name" }), makeParams("d1"));
    expect(res.status).toBe(200);
    expect((res._body as { name: string }).name).toBe("New name");
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
    mockRequireUserId.mockRejectedValue(new Error("Unauthorized"));
    const res = await DELETE({} as Request, makeParams("d1"));
    expect(res.status).toBe(401);
  });

  it("returns 404 when not owner", async () => {
    mockRequireUserId.mockResolvedValue("user-1");
    mockDb.select.mockReturnValue(makeSelectChain([]));
    const res = await DELETE({} as Request, makeParams("d1"));
    expect(res.status).toBe(404);
  });

  it("deletes dashboard and returns success", async () => {
    mockRequireUserId.mockResolvedValue("user-1");
    mockDb.select.mockReturnValue(makeSelectChain([OWNER_DASHBOARD]));
    mockDb.delete.mockReturnValue(makeDeleteChain());
    const res = await DELETE({} as Request, makeParams("d1"));
    expect(res.status).toBe(200);
    expect((res._body as { success: boolean }).success).toBe(true);
  });
});
