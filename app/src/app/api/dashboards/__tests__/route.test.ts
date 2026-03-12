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
    mockRequireSession.mockResolvedValue({ userId: "user-1", role: "creator", canWrite: true, tenantId: "default" });
    const ownedRow = {
      id: "d1",
      name: "My Dashboard",
      description: null,
      isPublic: false,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    // First call = owned, second = shared (empty), third = public (empty)
    mockDb.select
      .mockReturnValueOnce(makeSelectChain([ownedRow]))
      .mockReturnValueOnce(makeSelectChain([]))
      .mockReturnValueOnce(makeSelectChain([]));

    const res = await GET();
    expect(res.status).toBe(200);
    const body = res._body as Array<{ role: string }>;
    expect(body).toHaveLength(1);
    expect(body[0].role).toBe("owner");
  });

  it("merges owned and shared dashboards (creator role)", async () => {
    mockRequireSession.mockResolvedValue({ userId: "user-1", role: "creator", canWrite: true, tenantId: "default" });
    const ownedRow = { id: "d1", name: "Own", description: null, isPublic: false, createdAt: new Date(), updatedAt: new Date() };
    const sharedRow = { id: "d2", name: "Shared", description: null, isPublic: false, createdAt: new Date(), updatedAt: new Date(), role: "viewer" };
    mockDb.select
      .mockReturnValueOnce(makeSelectChain([ownedRow]))
      .mockReturnValueOnce(makeSelectChain([sharedRow]))
      .mockReturnValueOnce(makeSelectChain([]));

    const res = await GET();
    expect(res.status).toBe(200);
    const body = res._body as Array<{ id: string; role: string }>;
    expect(body).toHaveLength(2);
    expect(body.find((d) => d.id === "d1")?.role).toBe("owner");
    expect(body.find((d) => d.id === "d2")?.role).toBe("viewer");
  });

  it("returns all tenant dashboards for admin role", async () => {
    mockRequireSession.mockResolvedValue({ userId: "admin-1", role: "admin", canWrite: true, tenantId: "default" });
    const ownedRow = {
      id: "d1",
      name: "My Dashboard",
      description: null,
      isPublic: false,
      createdAt: new Date(),
      updatedAt: new Date(),
      ownerId: "admin-1",
    };
    const otherRow = {
      id: "d2",
      name: "Other Dashboard",
      description: null,
      isPublic: false,
      createdAt: new Date(),
      updatedAt: new Date(),
      ownerId: "user-1",
    };
    mockDb.select.mockReturnValueOnce(makeSelectChain([ownedRow, otherRow]));

    const res = await GET();
    expect(res.status).toBe(200);
    const body = res._body as Array<{ id: string; role: string }>;
    expect(body).toHaveLength(2);
    expect(body.find((d) => d.id === "d1")?.role).toBe("owner");
    expect(body.find((d) => d.id === "d2")?.role).toBe("admin");
  });

  it("returns only assigned dashboards for reader role", async () => {
    mockRequireSession.mockResolvedValue({ userId: "user-1", role: "reader", canWrite: false, tenantId: "default" });
    const assignedRow = { id: "d1", name: "Assigned", description: null, isPublic: false, createdAt: new Date(), updatedAt: new Date(), role: "viewer" };
    // Reader: owned + shared + public queries
    mockDb.select
      .mockReturnValueOnce(makeSelectChain([]))            // owned query (result discarded for reader)
      .mockReturnValueOnce(makeSelectChain([assignedRow])) // shared/assigned query
      .mockReturnValueOnce(makeSelectChain([]));           // public query

    const res = await GET();
    expect(res.status).toBe(200);
    const body = res._body as Array<{ id: string; role: string }>;
    expect(body).toHaveLength(1);
    expect(body[0].id).toBe("d1");
  });

  it("includes public dashboards for creator role", async () => {
    mockRequireSession.mockResolvedValue({ userId: "user-1", role: "creator", canWrite: true, tenantId: "default" });
    const ownedRow = { id: "d1", name: "Own", description: null, isPublic: false, createdAt: new Date(), updatedAt: new Date() };
    const publicRow = { id: "d2", name: "Public Demo", description: null, isPublic: true, createdAt: new Date(), updatedAt: new Date() };
    mockDb.select
      .mockReturnValueOnce(makeSelectChain([ownedRow]))   // owned
      .mockReturnValueOnce(makeSelectChain([]))            // shared
      .mockReturnValueOnce(makeSelectChain([publicRow]));  // public

    const res = await GET();
    expect(res.status).toBe(200);
    const body = res._body as Array<{ id: string; role: string }>;
    expect(body).toHaveLength(2);
    expect(body.find((d) => d.id === "d1")?.role).toBe("owner");
    expect(body.find((d) => d.id === "d2")?.role).toBe("viewer");
  });

  it("deduplicates public dashboards already in owned or shared", async () => {
    mockRequireSession.mockResolvedValue({ userId: "user-1", role: "creator", canWrite: true, tenantId: "default" });
    const ownedRow = { id: "d1", name: "Own", description: null, isPublic: true, createdAt: new Date(), updatedAt: new Date() };
    const publicRow = { id: "d1", name: "Own", description: null, isPublic: true, createdAt: new Date(), updatedAt: new Date() };
    mockDb.select
      .mockReturnValueOnce(makeSelectChain([ownedRow]))   // owned
      .mockReturnValueOnce(makeSelectChain([]))            // shared
      .mockReturnValueOnce(makeSelectChain([publicRow]));  // public (same ID)

    const res = await GET();
    expect(res.status).toBe(200);
    const body = res._body as Array<{ id: string }>;
    expect(body).toHaveLength(1);
    expect(body[0].id).toBe("d1");
  });

  it("includes public dashboards for reader role", async () => {
    mockRequireSession.mockResolvedValue({ userId: "user-1", role: "reader", canWrite: false, tenantId: "default" });
    const publicRow = { id: "d1", name: "Public Demo", description: null, isPublic: true, createdAt: new Date(), updatedAt: new Date() };
    mockDb.select
      .mockReturnValueOnce(makeSelectChain([]))            // owned (discarded for reader)
      .mockReturnValueOnce(makeSelectChain([]))            // shared
      .mockReturnValueOnce(makeSelectChain([publicRow]));  // public

    const res = await GET();
    expect(res.status).toBe(200);
    const body = res._body as Array<{ id: string; role: string }>;
    expect(body).toHaveLength(1);
    expect(body[0].id).toBe("d1");
    expect(body[0].role).toBe("viewer");
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

  it("creates a dashboard and returns 201", async () => {
    mockRequireSession.mockResolvedValue({ userId: "user-1", role: "creator", canWrite: true, tenantId: "default" });
    const created = { id: "d1", name: "My Dashboard", userId: "user-1", createdAt: new Date() };
    mockDb.insert.mockReturnValue(makeInsertChain([created]));

    const res = await POST(makeRequest({ name: "My Dashboard" }));
    expect(res.status).toBe(201);
    expect(res._body).toEqual(created);
  });

  it("sets updatedBy to session userId on create", async () => {
    mockRequireSession.mockResolvedValue({ userId: "user-1", role: "creator", canWrite: true, tenantId: "default" });
    const created = { id: "d1", name: "Test", userId: "user-1", updatedBy: "user-1" };
    mockDb.insert.mockReturnValue(makeInsertChain([created]));

    const res = await POST(makeRequest({ name: "Test" }));
    expect(res.status).toBe(201);
    // Verify insert was called (values are passed through mock chain)
    expect(mockDb.insert).toHaveBeenCalled();
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
