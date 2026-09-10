import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  makeSelectChain,
  makeUpdateChain,
  makeDeleteChain,
  sqlColumns,
  sqlValues,
} from "@/__tests__/helpers/drizzle-mocks";
import { makeRequest, makeParams } from "@/__tests__/helpers/request-helpers";
import { nextResponseMockFactory } from "@/__tests__/helpers/next-mocks";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockRequireAdmin =
  vi.fn<
    () => Promise<{ userId: string; tenantId: string }>
  >();

const mockAuditRequest = vi.fn();

const mockDb = {
  select: vi.fn(),
  update: vi.fn(),
  delete: vi.fn(),
};

/** Track captured update fields for assertions */
let lastUpdateFields: Record<string, unknown> = {};

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

vi.mock("@/lib/auth/session", () => ({ requireAdmin: mockRequireAdmin }));
vi.mock("@/lib/db", () => ({ db: mockDb }));
// Audit is mocked so route assertions aren't polluted by its own db.insert.
vi.mock("@/lib/audit/audit", () => ({
  auditRequest: mockAuditRequest,
  auditLog: vi.fn(),
}));
vi.mock("next/server", () => nextResponseMockFactory());

// A non-default tenant, so a filter hard-coded to "default" cannot pass (#1607).
const ADMIN = { userId: "admin-1", tenantId: "tenant-x" };

/** The route scopes every users query by id AND the session tenant (#1607). */
function expectScopedToTenant(expr: unknown, id: string) {
  expect(sqlColumns(expr)).toEqual(expect.arrayContaining(["id", "tenant_id"]));
  expect(sqlValues(expr)).toEqual(expect.arrayContaining([id, "tenant-x"]));
}

// ---------------------------------------------------------------------------
// GET /api/users/[id]
// ---------------------------------------------------------------------------

describe("GET /api/users/[id]", () => {
  let GET: (
    req: Request,
    ctx: { params: Promise<{ id: string }> },
  ) => Promise<Response>;

  beforeEach(async () => {
    vi.resetModules();
    vi.clearAllMocks();
    vi.doMock("@/lib/auth/session", () => ({ requireAdmin: mockRequireAdmin }));
    vi.doMock("@/lib/db", () => ({ db: mockDb }));
    vi.doMock("next/server", () => nextResponseMockFactory());
    const mod = await import("../route");
    GET = mod.GET;
  });

  it("returns 401 when unauthenticated", async () => {
    mockRequireAdmin.mockRejectedValue(new UnauthorizedError());
    const res = await GET(makeRequest({}), makeParams("u1"));
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error.code).toBe("UNAUTHORIZED");
  });

  it("returns single user in envelope", async () => {
    mockRequireAdmin.mockResolvedValue(ADMIN);
    const user = {
      id: "u1",
      name: "Alice",
      email: "alice@example.com",
      role: "creator",
      canWrite: true,
      createdAt: new Date(),
    };
    const chain = makeSelectChain([user]);
    mockDb.select.mockReturnValue(chain);

    const res = await GET(makeRequest({}), makeParams("u1"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.id).toBe("u1");
    expect(body.data.name).toBe("Alice");
    expect(body.error).toBeNull();
    expect(chain.calls.where).toHaveLength(1);
    expectScopedToTenant(chain.calls.where[0][0], "u1");
  });

  it("returns 404 when user not found", async () => {
    mockRequireAdmin.mockResolvedValue(ADMIN);
    mockDb.select.mockReturnValue(makeSelectChain([]));

    const res = await GET(makeRequest({}), makeParams("nonexistent"));
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error.code).toBe("NOT_FOUND");
  });
});

// ---------------------------------------------------------------------------
// PATCH /api/users/[id]
// ---------------------------------------------------------------------------

describe("PATCH /api/users/[id]", () => {
  let PATCH: (
    req: Request,
    ctx: { params: Promise<{ id: string }> },
  ) => Promise<Response>;

  beforeEach(async () => {
    vi.resetModules();
    vi.clearAllMocks();
    vi.doMock("@/lib/auth/session", () => ({ requireAdmin: mockRequireAdmin }));
    vi.doMock("@/lib/db", () => ({ db: mockDb }));
    vi.doMock("next/server", () => nextResponseMockFactory());
    const mod = await import("../route");
    PATCH = mod.PATCH;
  });

  it("returns 401 when unauthenticated", async () => {
    mockRequireAdmin.mockRejectedValue(new UnauthorizedError());
    const res = await PATCH(makeRequest({ canWrite: false }), makeParams("u1"));
    expect(res.status).toBe(401);
  });

  it("updates canWrite field and returns envelope", async () => {
    mockRequireAdmin.mockResolvedValue(ADMIN);
    const updated = {
      id: "u1",
      name: "Bob",
      email: "bob@example.com",
      role: "creator",
      canWrite: false,
      createdAt: new Date(),
    };
    const chain = makeUpdateChain([updated]);
    mockDb.update.mockReturnValue(chain);

    const res = await PATCH(makeRequest({ canWrite: false }), makeParams("u1"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.canWrite).toBe(false);
    expect(body.error).toBeNull();
    expect(chain.calls.where).toHaveLength(1);
    expectScopedToTenant(chain.calls.where[0][0], "u1");
  });

  it("updates both role and canWrite", async () => {
    mockRequireAdmin.mockResolvedValue(ADMIN);
    // PATCH reads the current role to decide whether this is a demotion
    // (route.ts:100-105). This test passed only because the GET describe's
    // last case had left a select stub behind — reorder the file and it 500s
    // (#1630).
    const roleRead = makeSelectChain([{ role: "creator" }]);
    mockDb.select.mockReturnValue(roleRead);
    const updated = {
      id: "u2",
      name: "Eve",
      email: "eve@example.com",
      role: "creator",
      canWrite: false,
      createdAt: new Date(),
    };
    const update = makeUpdateChain([updated]);
    mockDb.update.mockReturnValue(update);

    const res = await PATCH(
      makeRequest({ role: "creator", canWrite: false }),
      makeParams("u2"),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.role).toBe("creator");
    expect(body.data.canWrite).toBe(false);
    // Both the demotion read and the write are scoped to the tenant.
    expect(roleRead.calls.where).toHaveLength(1);
    expectScopedToTenant(roleRead.calls.where[0][0], "u2");
    expect(update.calls.where).toHaveLength(1);
    expectScopedToTenant(update.calls.where[0][0], "u2");
  });

  it("emits both user.update and user.role.change on a privilege change (#1234)", async () => {
    mockRequireAdmin.mockResolvedValue(ADMIN);
    // The demotion check reads the current role first (route.ts:100-105).
    // Found by turning shuffling on: this test was borrowing a select stub
    // from whichever case happened to run before it (#1630).
    mockDb.select.mockReturnValue(makeSelectChain([{ role: "creator" }]));
    mockDb.update.mockReturnValue(
      makeUpdateChain([
        {
          id: "u2",
          name: "Eve",
          email: "eve@example.com",
          role: "admin",
          canWrite: true,
          createdAt: new Date(),
        },
      ]),
    );

    await PATCH(makeRequest({ role: "admin" }), makeParams("u2"));

    const actions = mockAuditRequest.mock.calls.map(([, e]) => e.action);
    expect(actions).toEqual(["user.update", "user.role.change"]);

    const roleChange = mockAuditRequest.mock.calls[1][1];
    expect(roleChange).toMatchObject({
      resourceType: "user",
      resourceId: "u2",
      details: { role: "admin", canWrite: true },
    });
  });

  it("emits only user.update when no privilege field changes (#1234)", async () => {
    mockRequireAdmin.mockResolvedValue(ADMIN);
    mockDb.update.mockReturnValue(
      makeUpdateChain([
        {
          id: "u3",
          name: "Renamed",
          email: "r@example.com",
          role: "creator",
          canWrite: true,
          createdAt: new Date(),
        },
      ]),
    );

    await PATCH(makeRequest({ disabled: false }), makeParams("u3"));

    const actions = mockAuditRequest.mock.calls.map(([, e]) => e.action);
    expect(actions).toEqual(["user.update"]);
  });

  it("writes no audit entry when an admin tries to change their own role (#1234)", async () => {
    mockRequireAdmin.mockResolvedValue(ADMIN);

    const res = await PATCH(
      makeRequest({ role: "reader" }),
      makeParams(ADMIN.userId),
    );

    expect(res.status).toBe(400);
    expect(mockAuditRequest).not.toHaveBeenCalled();
  });

  it("returns 400 when body is empty", async () => {
    mockRequireAdmin.mockResolvedValue(ADMIN);
    const res = await PATCH(makeRequest({}), makeParams("u3"));
    expect(res.status).toBe(400);
  });

  it("returns 400 when self-editing", async () => {
    mockRequireAdmin.mockResolvedValue(ADMIN);
    const res = await PATCH(
      makeRequest({ canWrite: false }),
      makeParams("admin-1"),
    );
    expect(res.status).toBe(400);
  });

  it("returns 404 when user not found", async () => {
    mockRequireAdmin.mockResolvedValue(ADMIN);
    mockDb.update.mockReturnValue(makeUpdateChain([]));
    const res = await PATCH(
      makeRequest({ canWrite: false }),
      makeParams("nonexistent"),
    );
    expect(res.status).toBe(404);
  });

  it("returns 403 and updates nothing when caller is not admin", async () => {
    mockRequireAdmin.mockRejectedValue(new ForbiddenError());
    const res = await PATCH(makeRequest({ role: "reader" }), makeParams("u1"));
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error.message).toBe("Forbidden");
    expect(mockDb.update).not.toHaveBeenCalled();
  });

  it("disables a user by setting disabled=true", async () => {
    mockRequireAdmin.mockResolvedValue(ADMIN);
    const updated = {
      id: "u1",
      name: "Bob",
      email: "bob@example.com",
      role: "creator",
      canWrite: true,
      disabledAt: new Date(),
      lastLoginAt: null,
      createdAt: new Date(),
    };
    mockDb.update.mockReturnValue(makeUpdateChain([updated]));

    const res = await PATCH(makeRequest({ disabled: true }), makeParams("u1"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.disabledAt).toBeTruthy();
  });

  it("re-enables a user by setting disabled=false", async () => {
    mockRequireAdmin.mockResolvedValue(ADMIN);
    const updated = {
      id: "u1",
      name: "Bob",
      email: "bob@example.com",
      role: "creator",
      canWrite: true,
      disabledAt: null,
      lastLoginAt: null,
      createdAt: new Date(),
    };
    mockDb.update.mockReturnValue(makeUpdateChain([updated]));

    const res = await PATCH(makeRequest({ disabled: false }), makeParams("u1"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.disabledAt).toBeNull();
  });

  it("sets passwordChangedAt on demotion (admin→creator)", async () => {
    mockRequireAdmin.mockResolvedValue(ADMIN);
    lastUpdateFields = {};
    const mockSet = vi.fn().mockImplementation((fields) => {
      lastUpdateFields = fields;
      return {
        where: () => ({
          returning: () =>
            Promise.resolve([
              {
                id: "u2",
                name: "Eve",
                email: "eve@example.com",
                role: "creator",
                canWrite: true,
                disabledAt: null,
                lastLoginAt: null,
                createdAt: new Date(),
              },
            ]),
        }),
      };
    });
    mockDb.update.mockReturnValue({ set: mockSet });
    // Must also mock select to return current role as admin
    mockDb.select.mockReturnValue(makeSelectChain([{ role: "admin" }]));

    const res = await PATCH(makeRequest({ role: "creator" }), makeParams("u2"));
    expect(res.status).toBe(200);
    expect(lastUpdateFields.passwordChangedAt).toBeInstanceOf(Date);
  });

  it("does NOT set passwordChangedAt on promotion (reader→creator)", async () => {
    mockRequireAdmin.mockResolvedValue(ADMIN);
    lastUpdateFields = {};
    const mockSet = vi.fn().mockImplementation((fields) => {
      lastUpdateFields = fields;
      return {
        where: () => ({
          returning: () =>
            Promise.resolve([
              {
                id: "u2",
                name: "Eve",
                email: "eve@example.com",
                role: "creator",
                canWrite: true,
                disabledAt: null,
                lastLoginAt: null,
                createdAt: new Date(),
              },
            ]),
        }),
      };
    });
    mockDb.update.mockReturnValue({ set: mockSet });
    mockDb.select.mockReturnValue(makeSelectChain([{ role: "reader" }]));

    const res = await PATCH(makeRequest({ role: "creator" }), makeParams("u2"));
    expect(res.status).toBe(200);
    expect(lastUpdateFields.passwordChangedAt).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// DELETE /api/users/[id]
// ---------------------------------------------------------------------------

describe("DELETE /api/users/[id]", () => {
  let DELETE: (
    req: Request,
    ctx: { params: Promise<{ id: string }> },
  ) => Promise<Response>;

  beforeEach(async () => {
    vi.resetModules();
    vi.clearAllMocks();
    vi.doMock("@/lib/auth/session", () => ({ requireAdmin: mockRequireAdmin }));
    vi.doMock("@/lib/db", () => ({ db: mockDb }));
    vi.doMock("next/server", () => nextResponseMockFactory());
    vi.mock("@/lib/auth/errors", () => ({ UnauthorizedError, ForbiddenError }));
    const mod = await import("../route");
    DELETE = mod.DELETE;
  });

  it("returns 401 when unauthenticated", async () => {
    mockRequireAdmin.mockRejectedValue(new UnauthorizedError());
    const res = await DELETE(makeRequest({}), makeParams("u1"));
    expect(res.status).toBe(401);
  });

  it("returns 403 and deletes nothing when caller is not admin", async () => {
    mockRequireAdmin.mockRejectedValue(new ForbiddenError());
    const res = await DELETE(makeRequest({}), makeParams("u1"));
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error.message).toBe("Forbidden");
    expect(mockDb.delete).not.toHaveBeenCalled();
  });

  it("returns 400 when self-deleting", async () => {
    mockRequireAdmin.mockResolvedValue(ADMIN);
    const res = await DELETE(makeRequest({}), makeParams("admin-1"));
    expect(res.status).toBe(400);
  });

  it("returns 404 when user not found", async () => {
    mockRequireAdmin.mockResolvedValue(ADMIN);
    mockDb.delete.mockReturnValue(makeDeleteChain([]));
    const res = await DELETE(makeRequest({}), makeParams("nonexistent"));
    expect(res.status).toBe(404);
  });

  it("deletes user and returns envelope", async () => {
    mockRequireAdmin.mockResolvedValue(ADMIN);
    const chain = makeDeleteChain([{ id: "u1" }]);
    mockDb.delete.mockReturnValue(chain);
    const res = await DELETE(makeRequest({}), makeParams("u1"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.deleted).toBe(true);
    expect(body.error).toBeNull();
    expect(chain.calls.where).toHaveLength(1);
    expectScopedToTenant(chain.calls.where[0][0], "u1");
  });
});
