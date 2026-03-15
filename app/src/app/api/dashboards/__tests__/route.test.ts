import { describe, it, expect, vi, beforeEach } from "vitest";
import { makeSelectChain, makeInsertChain } from "@/__tests__/helpers/drizzle-mocks";
import { makeRequest } from "@/__tests__/helpers/request-helpers";
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
// Tests
// ---------------------------------------------------------------------------

describe("GET /api/dashboards", () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let GET: (req: Request) => Promise<any>;

  beforeEach(async () => {
    vi.resetModules();
    vi.clearAllMocks();
    const mod = await import("../route");
    GET = mod.GET;
  });

  it("returns 401 when unauthenticated", async () => {
    mockRequireSession.mockRejectedValue(new Error("Unauthorized"));
    const res = await GET(makeRequest({}, "http://localhost/api/dashboards"));
    expect(res.status).toBe(401);
  });

  it("returns owned dashboards with role=owner in envelope (creator role)", async () => {
    mockRequireSession.mockResolvedValue({ userId: "user-1", role: "creator", canWrite: true, tenantId: "default" });
    const ownedRow = {
      id: "d1",
      name: "My Dashboard",
      description: null,
      isPublic: false,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    mockDb.select
      .mockReturnValueOnce(makeSelectChain([ownedRow]))
      .mockReturnValueOnce(makeSelectChain([]))
      .mockReturnValueOnce(makeSelectChain([]));

    const res = await GET(makeRequest({}, "http://localhost/api/dashboards"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data).toHaveLength(1);
    expect(body.data[0].role).toBe("owner");
    expect(body.meta).toEqual({ total: 1, limit: 25, offset: 0 });
    expect(body.error).toBeNull();
  });

  it("merges owned and shared dashboards (creator role)", async () => {
    mockRequireSession.mockResolvedValue({ userId: "user-1", role: "creator", canWrite: true, tenantId: "default" });
    const ownedRow = { id: "d1", name: "Own", description: null, isPublic: false, createdAt: new Date(), updatedAt: new Date() };
    const sharedRow = { id: "d2", name: "Shared", description: null, isPublic: false, createdAt: new Date(), updatedAt: new Date(), role: "viewer" };
    mockDb.select
      .mockReturnValueOnce(makeSelectChain([ownedRow]))
      .mockReturnValueOnce(makeSelectChain([sharedRow]))
      .mockReturnValueOnce(makeSelectChain([]));

    const res = await GET(makeRequest({}, "http://localhost/api/dashboards"));
    const body = await res.json();
    expect(body.data).toHaveLength(2);
    expect(body.data.find((d: { id: string }) => d.id === "d1")?.role).toBe("owner");
    expect(body.data.find((d: { id: string }) => d.id === "d2")?.role).toBe("viewer");
  });

  it("returns all tenant dashboards for admin role", async () => {
    mockRequireSession.mockResolvedValue({ userId: "admin-1", role: "admin", canWrite: true, tenantId: "default" });
    const ownedRow = { id: "d1", name: "My Dashboard", description: null, isPublic: false, createdAt: new Date(), updatedAt: new Date(), ownerId: "admin-1" };
    const otherRow = { id: "d2", name: "Other Dashboard", description: null, isPublic: false, createdAt: new Date(), updatedAt: new Date(), ownerId: "user-1" };
    mockDb.select.mockReturnValueOnce(makeSelectChain([ownedRow, otherRow]));

    const res = await GET(makeRequest({}, "http://localhost/api/dashboards"));
    const body = await res.json();
    expect(body.data).toHaveLength(2);
    expect(body.data.find((d: { id: string }) => d.id === "d1")?.role).toBe("owner");
    expect(body.data.find((d: { id: string }) => d.id === "d2")?.role).toBe("admin");
    expect(body.meta.total).toBe(2);
  });

  it("returns only assigned dashboards for reader role", async () => {
    mockRequireSession.mockResolvedValue({ userId: "user-1", role: "reader", canWrite: false, tenantId: "default" });
    const assignedRow = { id: "d1", name: "Assigned", description: null, isPublic: false, createdAt: new Date(), updatedAt: new Date(), role: "viewer" };
    mockDb.select
      .mockReturnValueOnce(makeSelectChain([]))
      .mockReturnValueOnce(makeSelectChain([assignedRow]))
      .mockReturnValueOnce(makeSelectChain([]));

    const res = await GET(makeRequest({}, "http://localhost/api/dashboards"));
    const body = await res.json();
    expect(body.data).toHaveLength(1);
    expect(body.data[0].id).toBe("d1");
  });

  it("includes public dashboards for creator role", async () => {
    mockRequireSession.mockResolvedValue({ userId: "user-1", role: "creator", canWrite: true, tenantId: "default" });
    const ownedRow = { id: "d1", name: "Own", description: null, isPublic: false, createdAt: new Date(), updatedAt: new Date() };
    const publicRow = { id: "d2", name: "Public Demo", description: null, isPublic: true, createdAt: new Date(), updatedAt: new Date() };
    mockDb.select
      .mockReturnValueOnce(makeSelectChain([ownedRow]))
      .mockReturnValueOnce(makeSelectChain([]))
      .mockReturnValueOnce(makeSelectChain([publicRow]));

    const res = await GET(makeRequest({}, "http://localhost/api/dashboards"));
    const body = await res.json();
    expect(body.data).toHaveLength(2);
    expect(body.data.find((d: { id: string }) => d.id === "d1")?.role).toBe("owner");
    expect(body.data.find((d: { id: string }) => d.id === "d2")?.role).toBe("viewer");
  });

  it("deduplicates public dashboards already in owned or shared", async () => {
    mockRequireSession.mockResolvedValue({ userId: "user-1", role: "creator", canWrite: true, tenantId: "default" });
    const ownedRow = { id: "d1", name: "Own", description: null, isPublic: true, createdAt: new Date(), updatedAt: new Date() };
    const publicRow = { id: "d1", name: "Own", description: null, isPublic: true, createdAt: new Date(), updatedAt: new Date() };
    mockDb.select
      .mockReturnValueOnce(makeSelectChain([ownedRow]))
      .mockReturnValueOnce(makeSelectChain([]))
      .mockReturnValueOnce(makeSelectChain([publicRow]));

    const res = await GET(makeRequest({}, "http://localhost/api/dashboards"));
    const body = await res.json();
    expect(body.data).toHaveLength(1);
    expect(body.data[0].id).toBe("d1");
  });

  it("includes public dashboards for reader role", async () => {
    mockRequireSession.mockResolvedValue({ userId: "user-1", role: "reader", canWrite: false, tenantId: "default" });
    const publicRow = { id: "d1", name: "Public Demo", description: null, isPublic: true, createdAt: new Date(), updatedAt: new Date() };
    mockDb.select
      .mockReturnValueOnce(makeSelectChain([]))
      .mockReturnValueOnce(makeSelectChain([]))
      .mockReturnValueOnce(makeSelectChain([publicRow]));

    const res = await GET(makeRequest({}, "http://localhost/api/dashboards"));
    const body = await res.json();
    expect(body.data).toHaveLength(1);
    expect(body.data[0].id).toBe("d1");
    expect(body.data[0].role).toBe("viewer");
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

  it("returns 401 when unauthenticated", async () => {
    mockRequireSession.mockRejectedValue(new Error("Unauthorized"));
    const res = await POST(makeRequest({ name: "DB" }));
    expect(res.status).toBe(401);
  });

  it("returns 403 for reader role", async () => {
    mockRequireSession.mockResolvedValue({ userId: "user-1", role: "reader", canWrite: false, tenantId: "default" });
    const res = await POST(makeRequest({ name: "DB" }));
    expect(res.status).toBe(403);
  });

  it("returns 400 when name is missing", async () => {
    mockRequireSession.mockResolvedValue({ userId: "user-1", role: "creator", canWrite: true, tenantId: "default" });
    const res = await POST(makeRequest({}));
    expect(res.status).toBe(400);
  });

  it("creates a dashboard and returns 201 envelope", async () => {
    mockRequireSession.mockResolvedValue({ userId: "user-1", role: "creator", canWrite: true, tenantId: "default" });
    const created = { id: "d1", name: "My Dashboard", userId: "user-1", createdAt: new Date() };
    mockDb.insert.mockReturnValue(makeInsertChain([created]));

    const res = await POST(makeRequest({ name: "My Dashboard" }));
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.data).toEqual(created);
    expect(body.error).toBeNull();
  });

  it("sets updatedBy to session userId on create", async () => {
    mockRequireSession.mockResolvedValue({ userId: "user-1", role: "creator", canWrite: true, tenantId: "default" });
    const created = { id: "d1", name: "Test", userId: "user-1", updatedBy: "user-1" };
    const valuesSpy = vi.fn();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const chain: any = {
      values: (...args: unknown[]) => { valuesSpy(...args); return chain; },
      returning: () => Promise.resolve([created]),
    };
    mockDb.insert.mockReturnValue(chain);

    const res = await POST(makeRequest({ name: "Test" }));
    expect(res.status).toBe(201);
    expect(valuesSpy).toHaveBeenCalledWith(expect.objectContaining({ updatedBy: "user-1" }));
  });
});

describe("GET /api/dashboards — updatedByName", () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let GET: () => Promise<any>;

  beforeEach(async () => {
    vi.resetModules();
    vi.clearAllMocks();
    const mod = await import("../route");
    GET = mod.GET;
  });

  it("returns updatedByName from joined user for admin", async () => {
    mockRequireSession.mockResolvedValue({ userId: "admin-1", role: "admin", canWrite: true, tenantId: "default" });
    const row = {
      id: "d1",
      name: "Dashboard",
      description: null,
      isPublic: false,
      createdAt: new Date(),
      updatedAt: new Date(),
      ownerId: "admin-1",
      updatedByName: "Alice",
    };
    mockDb.select.mockReturnValueOnce(makeSelectChain([row]));

    const res = await GET();
    expect(res.status).toBe(200);
    const body = res._body as Array<{ updatedByName: string | null }>;
    expect(body[0].updatedByName).toBe("Alice");
  });

  it("returns updatedByName as null when no updater", async () => {
    mockRequireSession.mockResolvedValue({ userId: "user-1", role: "creator", canWrite: true, tenantId: "default" });
    const ownedRow = {
      id: "d1",
      name: "Dashboard",
      description: null,
      isPublic: false,
      createdAt: new Date(),
      updatedAt: new Date(),
      updatedByName: null,
    };
    mockDb.select
      .mockReturnValueOnce(makeSelectChain([ownedRow]))
      .mockReturnValueOnce(makeSelectChain([]))
      .mockReturnValueOnce(makeSelectChain([]));

    const res = await GET();
    expect(res.status).toBe(200);
    const body = res._body as Array<{ updatedByName: string | null }>;
    expect(body[0].updatedByName).toBeNull();
  });
});
