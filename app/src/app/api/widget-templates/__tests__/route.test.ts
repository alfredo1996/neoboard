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
    orderBy: () => c,
    limit: () => Promise.resolve(rows),
  });
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
// Tests — GET /api/widget-templates
// ---------------------------------------------------------------------------

describe("GET /api/widget-templates", () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let GET: (req: Request) => Promise<any>;

  beforeEach(async () => {
    vi.resetModules();
    vi.clearAllMocks();
    const mod = await import("../route");
    GET = mod.GET;
  });

  function makeRequest(params?: Record<string, string>) {
    const url = new URL("http://localhost/api/widget-templates");
    if (params) {
      for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
    }
    return { url: url.toString() } as Request;
  }

  it("returns 401 when unauthenticated", async () => {
    mockRequireSession.mockRejectedValue(new Error("Unauthorized"));
    const res = await GET(makeRequest());
    expect(res.status).toBe(401);
  });

  it("returns all tenant templates", async () => {
    mockRequireSession.mockResolvedValue({ userId: "user-1", role: "creator", canWrite: true, tenantId: "default" });
    const template = { id: "t1", name: "My Template", chartType: "bar", connectorType: "neo4j" };
    mockDb.select.mockReturnValue(makeSelectChain([template]));

    const res = await GET(makeRequest());
    expect(res.status).toBe(200);
    const body = res._body as unknown[];
    expect(body).toHaveLength(1);
  });

  it("supports filtering by chartType", async () => {
    mockRequireSession.mockResolvedValue({ userId: "user-1", role: "creator", canWrite: true, tenantId: "default" });
    mockDb.select.mockReturnValue(makeSelectChain([]));
    const res = await GET(makeRequest({ chartType: "bar" }));
    expect(res.status).toBe(200);
  });

  it("supports filtering by connectorType", async () => {
    mockRequireSession.mockResolvedValue({ userId: "user-1", role: "creator", canWrite: true, tenantId: "default" });
    mockDb.select.mockReturnValue(makeSelectChain([]));
    const res = await GET(makeRequest({ connectorType: "neo4j" }));
    expect(res.status).toBe(200);
  });
});

// ---------------------------------------------------------------------------
// Tests — POST /api/widget-templates
// ---------------------------------------------------------------------------

describe("POST /api/widget-templates", () => {
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
    const res = await POST(makeRequest({ name: "T", chartType: "bar", connectorType: "neo4j" }));
    expect(res.status).toBe(401);
  });

  it("returns 403 for reader role", async () => {
    mockRequireSession.mockResolvedValue({ userId: "user-1", role: "reader", canWrite: false, tenantId: "default" });
    const res = await POST(makeRequest({ name: "T", chartType: "bar", connectorType: "neo4j" }));
    expect(res.status).toBe(403);
  });

  it("returns 400 when name is missing", async () => {
    mockRequireSession.mockResolvedValue({ userId: "user-1", role: "creator", canWrite: true, tenantId: "default" });
    const res = await POST(makeRequest({ chartType: "bar", connectorType: "neo4j" }));
    expect(res.status).toBe(400);
  });

  it("returns 400 when chartType is missing", async () => {
    mockRequireSession.mockResolvedValue({ userId: "user-1", role: "creator", canWrite: true, tenantId: "default" });
    const res = await POST(makeRequest({ name: "T", connectorType: "neo4j" }));
    expect(res.status).toBe(400);
  });

  it("returns 400 when connectorType is invalid", async () => {
    mockRequireSession.mockResolvedValue({ userId: "user-1", role: "creator", canWrite: true, tenantId: "default" });
    const res = await POST(makeRequest({ name: "T", chartType: "bar", connectorType: "mysql" }));
    expect(res.status).toBe(400);
  });

  it("creates template and returns 201", async () => {
    mockRequireSession.mockResolvedValue({ userId: "user-1", role: "creator", canWrite: true, tenantId: "default" });
    const created = { id: "t1", name: "My Template", chartType: "bar", connectorType: "neo4j", createdBy: "user-1" };
    mockDb.insert.mockReturnValue(makeInsertChain([created]));

    const res = await POST(makeRequest({ name: "My Template", chartType: "bar", connectorType: "neo4j" }));
    expect(res.status).toBe(201);
    expect(res._body).toEqual(created);
  });
});
