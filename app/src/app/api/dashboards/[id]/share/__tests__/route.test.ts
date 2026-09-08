import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  makeSelectChain,
  makeInsertChain,
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
  insert: vi.fn(),
  update: vi.fn(),
  delete: vi.fn(),
};

// vi.hoisted: vi.mock factories are hoisted above top-level consts, so the
// mock must be created in the hoisted scope to stay safe if a future refactor
// switches this file to a static import of the route.
const { mockAuditRequest } = vi.hoisted(() => ({ mockAuditRequest: vi.fn() }));

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
// Audit is mocked so route assertions aren't polluted by its own db.insert.
vi.mock("@/lib/audit/audit", () => ({
  auditRequest: mockAuditRequest,
  auditLog: vi.fn(),
}));
vi.mock("next/server", () => nextResponseMockFactory());
vi.mock("@/lib/auth/errors", () => ({ UnauthorizedError, ForbiddenError }));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeDeleteRequest(url: string) {
  return { url } as Request;
}

// Session tenant deliberately differs from the schema default so a route that
// hard-coded "default" instead of the session tenant would fail (#1607).
const SESSION = {
  userId: "user-1",
  role: "creator",
  canWrite: true,
  tenantId: "tenant-x",
};
const ADMIN_SESSION = {
  userId: "admin-1",
  role: "admin",
  canWrite: true,
  tenantId: "tenant-x",
};
const DASHBOARD = {
  id: "d1",
  userId: "user-1",
  tenantId: "tenant-x",
  name: "Dash",
};

// ---------------------------------------------------------------------------
// GET
// ---------------------------------------------------------------------------

describe("GET /api/dashboards/[id]/share", () => {
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
      {
        id: "s1",
        role: "viewer",
        createdAt: new Date(),
        userName: "Alice",
        userEmail: "alice@example.com",
      },
    ];
    const sharesChain = makeSelectChain(shares);
    mockDb.select.mockReturnValueOnce(sharesChain);
    const res = await GET({} as Request, makeParams("d1"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data).toHaveLength(1);
    // The share listing itself is tenant-scoped, not just the access check.
    expect(sharesChain.calls.where).toHaveLength(1);
    const [expr] = sharesChain.calls.where[0];
    expect(sqlColumns(expr)).toEqual(
      expect.arrayContaining(["dashboardId", "tenant_id"]),
    );
    expect(sqlValues(expr)).toEqual(
      expect.arrayContaining(["d1", SESSION.tenantId]),
    );
  });

  it("returns shares for admin accessing any dashboard", async () => {
    mockRequireSession.mockResolvedValue(ADMIN_SESSION);
    mockDb.select.mockReturnValueOnce(
      makeSelectChain([{ ...DASHBOARD, userId: "someone-else" }]),
    );
    mockDb.select.mockReturnValueOnce(makeSelectChain([]));
    const res = await GET({} as Request, makeParams("d1"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// POST
// ---------------------------------------------------------------------------

describe("POST /api/dashboards/[id]/share", () => {
  let POST: (
    req: Request,
    ctx: { params: Promise<{ id: string }> },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ) => Promise<any>;

  beforeEach(async () => {
    vi.resetModules();
    vi.clearAllMocks();
    const mod = await import("../route");
    POST = mod.POST;
  });

  it("returns 401 when unauthenticated", async () => {
    mockRequireSession.mockRejectedValue(new UnauthorizedError());
    const res = await POST(
      makeRequest({ email: "a@b.com", role: "viewer" }),
      makeParams("d1"),
    );
    expect(res.status).toBe(401);
  });

  it("returns 404 when dashboard not found", async () => {
    mockRequireSession.mockResolvedValue(SESSION);
    mockDb.select.mockReturnValueOnce(makeSelectChain([]));
    const res = await POST(
      makeRequest({ email: "a@b.com", role: "viewer" }),
      makeParams("d1"),
    );
    expect(res.status).toBe(404);
  });

  it("returns 400 when email is invalid", async () => {
    mockRequireSession.mockResolvedValue(SESSION);
    mockDb.select.mockReturnValueOnce(makeSelectChain([DASHBOARD]));
    const res = await POST(
      makeRequest({ email: "not-an-email", role: "viewer" }),
      makeParams("d1"),
    );
    expect(res.status).toBe(400);
  });

  it("returns 400 when role is invalid", async () => {
    mockRequireSession.mockResolvedValue(SESSION);
    mockDb.select.mockReturnValueOnce(makeSelectChain([DASHBOARD]));
    const res = await POST(
      makeRequest({ email: "a@b.com", role: "owner" }),
      makeParams("d1"),
    );
    expect(res.status).toBe(400);
  });

  it("returns 404 when target user not found", async () => {
    mockRequireSession.mockResolvedValue(SESSION);
    mockDb.select.mockReturnValueOnce(makeSelectChain([DASHBOARD]));
    mockDb.select.mockReturnValueOnce(makeSelectChain([]));
    const res = await POST(
      makeRequest({ email: "unknown@example.com", role: "viewer" }),
      makeParams("d1"),
    );
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error.message).toBe("User not found");
  });

  it("returns 400 when sharing with yourself", async () => {
    mockRequireSession.mockResolvedValue(SESSION);
    mockDb.select.mockReturnValueOnce(makeSelectChain([DASHBOARD]));
    mockDb.select.mockReturnValueOnce(makeSelectChain([{ id: "user-1" }]));
    const res = await POST(
      makeRequest({ email: "self@example.com", role: "viewer" }),
      makeParams("d1"),
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error.message).toBe("Cannot share with yourself");
  });

  it("creates new share when none exists", async () => {
    mockRequireSession.mockResolvedValue(SESSION);
    mockDb.select.mockReturnValueOnce(makeSelectChain([DASHBOARD]));
    const userChain = makeSelectChain([{ id: "user-2" }]);
    mockDb.select.mockReturnValueOnce(userChain);
    mockDb.select.mockReturnValueOnce(makeSelectChain([]));
    const insertChain = makeInsertChain();
    mockDb.insert.mockReturnValue(insertChain);
    const res = await POST(
      makeRequest({ email: "other@example.com", role: "viewer" }),
      makeParams("d1"),
    );
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.data.success).toBe(true);

    // The sharee lookup is tenant-scoped — an email in another tenant must
    // not resolve (#1607).
    const [userExpr] = userChain.calls.where[0];
    expect(sqlColumns(userExpr)).toEqual(
      expect.arrayContaining(["email", "tenant_id"]),
    );
    expect(sqlValues(userExpr)).toEqual(
      expect.arrayContaining(["other@example.com", SESSION.tenantId]),
    );
    // The new row carries the session tenant, never one from the body.
    expect(insertChain.calls.values[0][0]).toMatchObject({
      dashboardId: "d1",
      userId: "user-2",
      tenantId: SESSION.tenantId,
    });
  });

  it("records a dashboard.share audit entry (#1234)", async () => {
    mockRequireSession.mockResolvedValue(SESSION);
    mockDb.select.mockReturnValueOnce(makeSelectChain([DASHBOARD]));
    mockDb.select.mockReturnValueOnce(makeSelectChain([{ id: "user-2" }]));
    mockDb.select.mockReturnValueOnce(makeSelectChain([]));
    mockDb.insert.mockReturnValue(makeInsertChain());

    await POST(
      makeRequest({ email: "other@example.com", role: "viewer" }),
      makeParams("d1"),
    );

    expect(mockAuditRequest).toHaveBeenCalledTimes(1);
    const [, entry] = mockAuditRequest.mock.calls[0];
    expect(entry).toMatchObject({
      action: "dashboard.share",
      resourceType: "dashboard",
      resourceId: "d1",
      tenantId: SESSION.tenantId,
      userId: SESSION.userId,
      details: { targetUserId: "user-2", role: "viewer" },
    });
  });

  it("writes no audit entry when the target user does not exist (#1234)", async () => {
    mockRequireSession.mockResolvedValue(SESSION);
    mockDb.select.mockReturnValueOnce(makeSelectChain([DASHBOARD]));
    mockDb.select.mockReturnValueOnce(makeSelectChain([]));

    const res = await POST(
      makeRequest({ email: "unknown@example.com", role: "viewer" }),
      makeParams("d1"),
    );

    expect(res.status).toBe(404);
    expect(mockAuditRequest).not.toHaveBeenCalled();
  });

  it("updates existing share role (upsert)", async () => {
    mockRequireSession.mockResolvedValue(SESSION);
    mockDb.select.mockReturnValueOnce(makeSelectChain([DASHBOARD]));
    mockDb.select.mockReturnValueOnce(makeSelectChain([{ id: "user-2" }]));
    mockDb.select.mockReturnValueOnce(
      makeSelectChain([
        { id: "s1", dashboardId: "d1", userId: "user-2", role: "viewer" },
      ]),
    );
    mockDb.update.mockReturnValue(makeUpdateChain());
    const res = await POST(
      makeRequest({ email: "other@example.com", role: "editor" }),
      makeParams("d1"),
    );
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.data.success).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// DELETE
// ---------------------------------------------------------------------------

describe("DELETE /api/dashboards/[id]/share", () => {
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
    const res = await DELETE(
      makeDeleteRequest("http://localhost/api/dashboards/d1/share"),
      makeParams("d1"),
    );
    expect(res.status).toBe(401);
  });

  it("returns 404 when dashboard not found", async () => {
    mockRequireSession.mockResolvedValue(SESSION);
    mockDb.select.mockReturnValueOnce(makeSelectChain([]));
    const res = await DELETE(
      makeDeleteRequest("http://localhost/api/dashboards/d1/share"),
      makeParams("d1"),
    );
    expect(res.status).toBe(404);
  });

  it("returns 400 when shareId is missing", async () => {
    mockRequireSession.mockResolvedValue(SESSION);
    mockDb.select.mockReturnValueOnce(makeSelectChain([DASHBOARD]));
    const res = await DELETE(
      makeDeleteRequest("http://localhost/api/dashboards/d1/share"),
      makeParams("d1"),
    );
    expect(res.status).toBe(400);
  });

  it("deletes share and returns success", async () => {
    mockRequireSession.mockResolvedValue(SESSION);
    mockDb.select.mockReturnValueOnce(makeSelectChain([DASHBOARD]));
    const deleteChain = makeDeleteChain();
    mockDb.delete.mockReturnValue(deleteChain);
    const res = await DELETE(
      makeDeleteRequest("http://localhost/api/dashboards/d1/share?shareId=s1"),
      makeParams("d1"),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.success).toBe(true);
    // Deletes by share id AND dashboard AND tenant, so a share id from another
    // tenant's dashboard cannot be revoked through this one (#1607).
    expect(deleteChain.calls.where).toHaveLength(1);
    const [expr] = deleteChain.calls.where[0];
    expect(sqlColumns(expr)).toEqual(
      expect.arrayContaining(["id", "dashboardId", "tenant_id"]),
    );
    expect(sqlValues(expr)).toEqual(
      expect.arrayContaining(["s1", "d1", SESSION.tenantId]),
    );
  });

  it("records a dashboard.share.revoke audit entry (#1234)", async () => {
    mockRequireSession.mockResolvedValue(SESSION);
    mockDb.select.mockReturnValueOnce(makeSelectChain([DASHBOARD]));
    mockDb.delete.mockReturnValue(makeDeleteChain());

    await DELETE(
      makeDeleteRequest("http://localhost/api/dashboards/d1/share?shareId=s1"),
      makeParams("d1"),
    );

    expect(mockAuditRequest).toHaveBeenCalledTimes(1);
    const [, entry] = mockAuditRequest.mock.calls[0];
    expect(entry).toMatchObject({
      action: "dashboard.share.revoke",
      resourceType: "dashboard",
      resourceId: "d1",
      tenantId: SESSION.tenantId,
      userId: SESSION.userId,
      details: { shareId: "s1" },
    });
  });

  it("writes no audit entry when shareId is missing (#1234)", async () => {
    mockRequireSession.mockResolvedValue(SESSION);
    mockDb.select.mockReturnValueOnce(makeSelectChain([DASHBOARD]));

    const res = await DELETE(
      makeDeleteRequest("http://localhost/api/dashboards/d1/share"),
      makeParams("d1"),
    );

    expect(res.status).toBe(400);
    expect(mockAuditRequest).not.toHaveBeenCalled();
  });
});
