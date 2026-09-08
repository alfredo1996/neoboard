import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  makeSelectChain,
  makeUpdateChain,
  makeDeleteChain,
  sqlColumns,
  sqlValues,
} from "@/__tests__/helpers/drizzle-mocks";
import { nextResponseMockFactory } from "@/__tests__/helpers/next-mocks";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockRequireSession = vi.fn<
  () => Promise<{
    userId: string;
    role: string;
    canWrite: boolean;
    tenantId: string;
  }>
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

/**
 * Every query the route makes is scoped by template id AND the session tenant
 * (#1607). The tenant is non-default so a filter hard-coded to "default"
 * cannot pass.
 */
function expectScopedToTenant(expr: unknown, id: string) {
  expect(sqlColumns(expr)).toEqual(expect.arrayContaining(["id", "tenant_id"]));
  expect(sqlValues(expr)).toEqual(expect.arrayContaining([id, "tenant-x"]));
}

// ---------------------------------------------------------------------------
// Tests — GET /api/widget-templates/[id]
// ---------------------------------------------------------------------------

describe("GET /api/widget-templates/[id]", () => {
  let GET: (
    req: Request,
    ctx: { params: Promise<{ id: string }> },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ) => Promise<any>;

  beforeEach(async () => {
    vi.resetModules();
    vi.clearAllMocks();
    const mod = await import("../route");
    GET = mod.GET;
  });

  it("returns 401 when unauthenticated", async () => {
    mockRequireSession.mockRejectedValue(new UnauthorizedError());
    const res = await GET({} as Request, {
      params: Promise.resolve({ id: "t1" }),
    });
    expect(res.status).toBe(401);
  });

  it("returns 404 when template not found", async () => {
    mockRequireSession.mockResolvedValue({
      userId: "user-1",
      role: "creator",
      canWrite: true,
      tenantId: "default",
    });
    mockDb.select.mockReturnValue(makeSelectChain([]));
    const res = await GET({} as Request, {
      params: Promise.resolve({ id: "missing" }),
    });
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error.message).toBe("Not found");
  });

  it("returns template wrapped in envelope when found", async () => {
    mockRequireSession.mockResolvedValue({
      userId: "user-1",
      role: "creator",
      canWrite: true,
      tenantId: "tenant-x",
    });
    const template = {
      id: "t1",
      name: "My Template",
      chartType: "bar",
      connectorType: "neo4j",
      createdBy: "user-1",
    };
    const chain = makeSelectChain([template]);
    mockDb.select.mockReturnValue(chain);
    const res = await GET({} as Request, {
      params: Promise.resolve({ id: "t1" }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data).toEqual(template);
    expect(body.error).toBeNull();
    expect(chain.calls.where).toHaveLength(1);
    expectScopedToTenant(chain.calls.where[0][0], "t1");
  });
});

// ---------------------------------------------------------------------------
// Tests — PUT /api/widget-templates/[id]
// ---------------------------------------------------------------------------

describe("PUT /api/widget-templates/[id]", () => {
  let PUT: (
    req: Request,
    ctx: { params: Promise<{ id: string }> },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ) => Promise<any>;

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
    const res = await PUT(makeRequest({ name: "Updated" }), {
      params: Promise.resolve({ id: "t1" }),
    });
    expect(res.status).toBe(401);
  });

  it("returns 403 when user cannot write", async () => {
    mockRequireSession.mockResolvedValue({
      userId: "user-1",
      role: "creator",
      canWrite: false,
      tenantId: "default",
    });
    const res = await PUT(makeRequest({ name: "Updated" }), {
      params: Promise.resolve({ id: "t1" }),
    });
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error.message).toBe("Forbidden");
  });

  it("returns 404 when template not found", async () => {
    mockRequireSession.mockResolvedValue({
      userId: "user-1",
      role: "creator",
      canWrite: true,
      tenantId: "default",
    });
    mockDb.select.mockReturnValue(makeSelectChain([]));
    const res = await PUT(makeRequest({ name: "Updated" }), {
      params: Promise.resolve({ id: "missing" }),
    });
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error.message).toBe("Not found");
  });

  it("returns 403 when user is not the creator and not admin", async () => {
    mockRequireSession.mockResolvedValue({
      userId: "user-2",
      role: "creator",
      canWrite: true,
      tenantId: "default",
    });
    const existing = {
      id: "t1",
      name: "Old",
      createdBy: "user-1",
      tenantId: "default",
    };
    mockDb.select.mockReturnValue(makeSelectChain([existing]));
    const res = await PUT(makeRequest({ name: "Updated" }), {
      params: Promise.resolve({ id: "t1" }),
    });
    expect(res.status).toBe(403);
  });

  it("allows admin to update any template", async () => {
    mockRequireSession.mockResolvedValue({
      userId: "user-2",
      role: "admin",
      canWrite: true,
      tenantId: "default",
    });
    const existing = {
      id: "t1",
      name: "Old",
      createdBy: "user-1",
      tenantId: "default",
    };
    const updated = { ...existing, name: "Updated" };
    mockDb.select.mockReturnValue(makeSelectChain([existing]));
    mockDb.update.mockReturnValue(makeUpdateChain([updated]));
    const res = await PUT(makeRequest({ name: "Updated" }), {
      params: Promise.resolve({ id: "t1" }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data).toEqual(updated);
    expect(body.error).toBeNull();
  });

  it("allows creator to update own template", async () => {
    mockRequireSession.mockResolvedValue({
      userId: "user-1",
      role: "creator",
      canWrite: true,
      tenantId: "tenant-x",
    });
    const existing = {
      id: "t1",
      name: "Old",
      createdBy: "user-1",
      tenantId: "tenant-x",
    };
    const updated = { ...existing, name: "Updated" };
    const ownerRead = makeSelectChain([existing]);
    const update = makeUpdateChain([updated]);
    mockDb.select.mockReturnValue(ownerRead);
    mockDb.update.mockReturnValue(update);
    const res = await PUT(makeRequest({ name: "Updated" }), {
      params: Promise.resolve({ id: "t1" }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data).toEqual(updated);
    // Both the ownership read and the write are tenant-scoped (#1607).
    expect(ownerRead.calls.where).toHaveLength(1);
    expectScopedToTenant(ownerRead.calls.where[0][0], "t1");
    expect(update.calls.where).toHaveLength(1);
    expectScopedToTenant(update.calls.where[0][0], "t1");
  });

  // The schema-validation branch reads `parsed.error.issues[0].message`. Under
  // zod 3 that field was `.errors`; reaching for the wrong one throws on
  // `[0]` and turns this 400 into a 500, so the path needs a test of its own
  // rather than being inferred from the happy path (#1436).
  it("returns 400 with the validation message for a malformed body", async () => {
    mockRequireSession.mockResolvedValue({
      userId: "user-1",
      role: "creator",
      canWrite: true,
      tenantId: "default",
    });
    mockDb.select.mockReturnValue(
      makeSelectChain([
        { id: "t1", name: "Old", createdBy: "user-1", tenantId: "default" },
      ]),
    );

    // `tags` must be an array of strings.
    const res = await PUT(makeRequest({ tags: "not-an-array" }), {
      params: Promise.resolve({ id: "t1" }),
    });

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(typeof body.error?.message).toBe("string");
    expect(body.error.message.length).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// Tests — DELETE /api/widget-templates/[id]
// ---------------------------------------------------------------------------

describe("DELETE /api/widget-templates/[id]", () => {
  let DELETE: (
    req: Request,
    ctx: { params: Promise<{ id: string }> },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ) => Promise<any>;

  beforeEach(async () => {
    vi.resetModules();
    vi.clearAllMocks();
    const mod = await import("../route");
    DELETE = mod.DELETE;
  });

  it("returns 401 when unauthenticated", async () => {
    mockRequireSession.mockRejectedValue(new UnauthorizedError());
    const res = await DELETE({} as Request, {
      params: Promise.resolve({ id: "t1" }),
    });
    expect(res.status).toBe(401);
  });

  it("returns 403 when user cannot write", async () => {
    mockRequireSession.mockResolvedValue({
      userId: "user-1",
      role: "creator",
      canWrite: false,
      tenantId: "default",
    });
    const res = await DELETE({} as Request, {
      params: Promise.resolve({ id: "t1" }),
    });
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error.message).toBe("Forbidden");
  });

  it("returns 404 when template not found", async () => {
    mockRequireSession.mockResolvedValue({
      userId: "user-1",
      role: "creator",
      canWrite: true,
      tenantId: "default",
    });
    mockDb.select.mockReturnValue(makeSelectChain([]));
    const res = await DELETE({} as Request, {
      params: Promise.resolve({ id: "missing" }),
    });
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error.message).toBe("Not found");
  });

  it("returns 403 when user is not the creator and not admin", async () => {
    mockRequireSession.mockResolvedValue({
      userId: "user-2",
      role: "creator",
      canWrite: true,
      tenantId: "default",
    });
    const existing = {
      id: "t1",
      name: "My Template",
      createdBy: "user-1",
      tenantId: "default",
    };
    mockDb.select.mockReturnValue(makeSelectChain([existing]));
    const res = await DELETE({} as Request, {
      params: Promise.resolve({ id: "t1" }),
    });
    expect(res.status).toBe(403);
  });

  it("deletes template and returns { deleted: true } in envelope", async () => {
    mockRequireSession.mockResolvedValue({
      userId: "user-1",
      role: "creator",
      canWrite: true,
      tenantId: "tenant-x",
    });
    const existing = {
      id: "t1",
      name: "My Template",
      createdBy: "user-1",
      tenantId: "tenant-x",
    };
    const ownerRead = makeSelectChain([existing]);
    const del = makeDeleteChain();
    mockDb.select.mockReturnValue(ownerRead);
    mockDb.delete.mockReturnValue(del);
    const res = await DELETE({} as Request, {
      params: Promise.resolve({ id: "t1" }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data).toEqual({ deleted: true });
    expect(body.error).toBeNull();
    // Both the ownership read and the delete are tenant-scoped (#1607).
    expect(ownerRead.calls.where).toHaveLength(1);
    expectScopedToTenant(ownerRead.calls.where[0][0], "t1");
    expect(del.calls.where).toHaveLength(1);
    expectScopedToTenant(del.calls.where[0][0], "t1");
  });

  it("allows admin to delete any template", async () => {
    mockRequireSession.mockResolvedValue({
      userId: "user-2",
      role: "admin",
      canWrite: true,
      tenantId: "default",
    });
    const existing = {
      id: "t1",
      name: "My Template",
      createdBy: "user-1",
      tenantId: "default",
    };
    mockDb.select.mockReturnValue(makeSelectChain([existing]));
    mockDb.delete.mockReturnValue(makeDeleteChain());
    const res = await DELETE({} as Request, {
      params: Promise.resolve({ id: "t1" }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data).toEqual({ deleted: true });
  });
});
