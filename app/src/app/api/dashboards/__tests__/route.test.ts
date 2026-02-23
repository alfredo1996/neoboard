import { describe, it, expect, vi, beforeEach } from "vitest";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockRequireSession = vi.fn<() => Promise<{ userId: string; role: string }>>();

function makeSelectChain(rows: unknown[]) {
  const c: Record<string, unknown> = {};
  c.from = () => c;
  c.where = () => c;
  c.innerJoin = () => c;
  c.limit = () => Promise.resolve(rows);
  c.then = (resolve: (v: unknown[]) => unknown) => Promise.resolve(rows).then(resolve);
  return c;
}

function makeInsertChain(returning: unknown[]) {
  const c = {
    values: () => c,
    returning: () => Promise.resolve(returning),
  };
  return c;
}

const mockDb = {
  select: vi.fn(),
  insert: vi.fn(),
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
// Tests
// ---------------------------------------------------------------------------

describe("GET /api/dashboards", () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let GET: () => Promise<any>;

  beforeEach(async () => {
    vi.resetModules();
    vi.clearAllMocks();
    const mod = await import("../route");
    GET = mod.GET;
  });

  it("returns 401 when unauthenticated", async () => {
    mockRequireSession.mockRejectedValue(new Error("Unauthorized"));
    const res = await GET();
    expect(res.status).toBe(401);
  });

  it("returns owned dashboards with role=owner (creator role)", async () => {
    mockRequireSession.mockResolvedValue({ userId: "user-1", role: "creator" });
    const ownedRow = {
      id: "d1",
      name: "My Dashboard",
      description: null,
      isPublic: false,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    // First call = owned dashboards, second = shared dashboards (empty)
    mockDb.select
      .mockReturnValueOnce(makeSelectChain([ownedRow]))
      .mockReturnValueOnce(makeSelectChain([]));

    const res = await GET();
    expect(res.status).toBe(200);
    const body = res._body as Array<{ role: string }>;
    expect(body).toHaveLength(1);
    expect(body[0].role).toBe("owner");
  });

  it("merges owned and shared dashboards (creator role)", async () => {
    mockRequireSession.mockResolvedValue({ userId: "user-1", role: "creator" });
    const ownedRow = { id: "d1", name: "Own", description: null, isPublic: false, createdAt: new Date(), updatedAt: new Date() };
    const sharedRow = { id: "d2", name: "Shared", description: null, isPublic: false, createdAt: new Date(), updatedAt: new Date(), role: "viewer" };
    mockDb.select
      .mockReturnValueOnce(makeSelectChain([ownedRow]))
      .mockReturnValueOnce(makeSelectChain([sharedRow]));

    const res = await GET();
    expect(res.status).toBe(200);
    const body = res._body as Array<{ id: string; role: string }>;
    expect(body).toHaveLength(2);
    expect(body.find((d) => d.id === "d1")?.role).toBe("owner");
    expect(body.find((d) => d.id === "d2")?.role).toBe("viewer");
  });

  it("returns only assigned dashboards for reader role", async () => {
    mockRequireSession.mockResolvedValue({ userId: "user-1", role: "reader" });
    const assignedRow = { id: "d1", name: "Assigned", description: null, isPublic: false, createdAt: new Date(), updatedAt: new Date(), role: "viewer" };
    // Reader: only shared query is used
    mockDb.select
      .mockReturnValueOnce(makeSelectChain([]))   // owned (skipped for reader)
      .mockReturnValueOnce(makeSelectChain([assignedRow]));

    const res = await GET();
    expect(res.status).toBe(200);
    const body = res._body as Array<{ id: string; role: string }>;
    expect(body).toHaveLength(1);
    expect(body[0].id).toBe("d1");
  });
});

describe("POST /api/dashboards", () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let POST: (req: Request) => Promise<any>;

  beforeEach(async () => {
    vi.resetModules();
    vi.clearAllMocks();
    const mod = await import("../route");
    POST = mod.POST;
  });

  function makeRequest(body: unknown) {
    return { json: async () => body } as Request;
  }

  it("returns 401 when unauthenticated", async () => {
    mockRequireSession.mockRejectedValue(new Error("Unauthorized"));
    const res = await POST(makeRequest({ name: "DB" }));
    expect(res.status).toBe(401);
  });

  it("returns 400 when name is missing", async () => {
    mockRequireSession.mockResolvedValue({ userId: "user-1", role: "creator" });
    const res = await POST(makeRequest({}));
    expect(res.status).toBe(400);
  });

  it("creates a dashboard and returns 201", async () => {
    mockRequireSession.mockResolvedValue({ userId: "user-1", role: "creator" });
    const created = { id: "d1", name: "My Dashboard", userId: "user-1", createdAt: new Date() };
    mockDb.insert.mockReturnValue(makeInsertChain([created]));

    const res = await POST(makeRequest({ name: "My Dashboard" }));
    expect(res.status).toBe(201);
    expect(res._body).toEqual(created);
  });
});
