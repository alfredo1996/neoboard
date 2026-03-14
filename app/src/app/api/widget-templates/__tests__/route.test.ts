import { describe, it, expect, vi, beforeEach } from "vitest";
import { makeSelectChain, makeInsertChain } from "@/__tests__/helpers/drizzle-mocks";
import { nextResponseMockFactory } from "@/__tests__/helpers/next-mocks";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockRequireSession = vi.fn<
  () => Promise<{ userId: string; role: string; canWrite: boolean; tenantId: string }>
>();

const mockDb = {
  select: vi.fn(),
  insert: vi.fn(),
};

vi.mock("@/lib/auth/session", () => ({
  requireSession: mockRequireSession,
  requireUserId: vi.fn(),
}));
vi.mock("@/lib/db", () => ({ db: mockDb }));
vi.mock("next/server", () => nextResponseMockFactory());

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

  it("returns all tenant templates with pagination meta", async () => {
    mockRequireSession.mockResolvedValue({ userId: "user-1", role: "creator", canWrite: true, tenantId: "default" });
    const template = { id: "t1", name: "My Template", chartType: "bar", connectorType: "neo4j" };
    // First call -> count query ([{ total: 1 }]), second call -> rows
    mockDb.select
      .mockReturnValueOnce(makeSelectChain([{ total: 1 }]))
      .mockReturnValueOnce(makeSelectChain([template]));

    const res = await GET(makeRequest());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data).toHaveLength(1);
    expect(body.meta).toMatchObject({ total: 1, limit: 25, offset: 0 });
  });

  it("supports filtering by chartType", async () => {
    mockRequireSession.mockResolvedValue({ userId: "user-1", role: "creator", canWrite: true, tenantId: "default" });
    mockDb.select
      .mockReturnValueOnce(makeSelectChain([{ total: 0 }]))
      .mockReturnValueOnce(makeSelectChain([]));
    const res = await GET(makeRequest({ chartType: "bar" }));
    expect(res.status).toBe(200);
  });

  it("supports filtering by connectorType", async () => {
    mockRequireSession.mockResolvedValue({ userId: "user-1", role: "creator", canWrite: true, tenantId: "default" });
    mockDb.select
      .mockReturnValueOnce(makeSelectChain([{ total: 0 }]))
      .mockReturnValueOnce(makeSelectChain([]));
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
    const body = await res.json();
    expect(body.error.message).toBe("Forbidden");
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

  it("creates template and returns 201 with envelope", async () => {
    mockRequireSession.mockResolvedValue({ userId: "user-1", role: "creator", canWrite: true, tenantId: "default" });
    const created = { id: "t1", name: "My Template", chartType: "bar", connectorType: "neo4j", createdBy: "user-1" };
    mockDb.insert.mockReturnValue(makeInsertChain([created]));

    const res = await POST(makeRequest({ name: "My Template", chartType: "bar", connectorType: "neo4j" }));
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.data).toEqual(created);
    expect(body.error).toBeNull();
  });
});
