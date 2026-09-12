import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  makeSelectChain,
  makeDeleteChain,
  resetDbMock,
  makeUpdateChain,
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
    tenantId: string;
    canWrite: boolean;
    role: string;
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

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const SESSION = {
  userId: "user-1",
  tenantId: "tenant-1",
  canWrite: true,
  role: "creator",
};

const OWNER_DASHBOARD = {
  id: "d1",
  name: "Dashboard",
  userId: "user-1",
  tenantId: "tenant-1",
  description: null,
  isPublic: false,
  layoutJson: null,
  version: 3,
  createdAt: new Date(),
  updatedAt: new Date(),
};

/**
 * Assert one recorded `where` scoped the dashboard row by id AND by the
 * session tenant (#1607). Every query in this route that touches
 * `dashboards` must pass both — a bare primary-key lookup would resolve a
 * dashboard from any tenant.
 */
function expectScopedById(
  where: unknown[],
  tenantId = SESSION.tenantId,
  id = "d1",
) {
  const [expr] = where;
  expect(sqlColumns(expr)).toEqual(expect.arrayContaining(["id", "tenant_id"]));
  expect(sqlValues(expr)).toEqual(expect.arrayContaining([id, tenantId]));
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("GET /api/dashboards/[id]", () => {
  let GET: (
    req: Request,
    ctx: { params: Promise<{ id: string }> },
  ) => Promise<Response>;

  beforeEach(async () => {
    vi.resetModules();
    vi.clearAllMocks();
    resetDbMock(mockDb);
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
    mockDb.select.mockReturnValue(makeSelectChain([]));
    const res = await GET({} as Request, makeParams("d1"));
    expect(res.status).toBe(404);
  });

  it("returns dashboard for owner", async () => {
    mockRequireSession.mockResolvedValue(SESSION);
    const chain = makeSelectChain([OWNER_DASHBOARD]);
    mockDb.select.mockReturnValue(chain);
    const res = await GET({} as Request, makeParams("d1"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.id).toBe("d1");
    expect(body.data.role).toBe("owner");
    // Owner path makes two selects on the one chain: the access lookup and
    // the updatedByName join. Both must scope by tenant, not just by id.
    expect(chain.calls.where).toHaveLength(2);
    expectScopedById(chain.calls.where[0]);
    expectScopedById(chain.calls.where[1]);
  });

  it("returns dashboard for shared viewer", async () => {
    mockRequireSession.mockResolvedValue({ ...SESSION, userId: "user-2" });
    const sharedDashboard = { ...OWNER_DASHBOARD, userId: "user-1" };
    const share = {
      dashboardId: "d1",
      userId: "user-2",
      tenantId: "tenant-1",
      role: "viewer",
    };
    const dashboardChain = makeSelectChain([sharedDashboard]);
    const shareChain = makeSelectChain([share]);
    const metadataChain = makeSelectChain([{ updatedByName: "Alice" }]);
    mockDb.select
      .mockReturnValueOnce(dashboardChain)
      .mockReturnValueOnce(shareChain)
      // GET makes THREE selects: canAccess does the dashboard and share
      // lookups, then route.ts:117 reads updatedByName. The third was being
      // served by whatever permanent stub an earlier test had left behind
      // (#1630).
      .mockReturnValue(metadataChain);
    const res = await GET({} as Request, makeParams("d1"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.role).toBe("viewer");
    expectScopedById(dashboardChain.calls.where[0]);
    expectScopedById(metadataChain.calls.where[0]);
    // The share lookup is scoped by dashboard, caller AND tenant.
    const [shareExpr] = shareChain.calls.where[0];
    expect(sqlColumns(shareExpr)).toEqual(
      expect.arrayContaining(["dashboardId", "userId", "tenant_id"]),
    );
    expect(sqlValues(shareExpr)).toEqual(
      expect.arrayContaining(["d1", "user-2", "tenant-1"]),
    );
  });

  it("returns 404 when user has no access", async () => {
    mockRequireSession.mockResolvedValue({ ...SESSION, userId: "user-2" });
    const otherDashboard = { ...OWNER_DASHBOARD, userId: "user-1" };
    mockDb.select
      .mockReturnValueOnce(makeSelectChain([otherDashboard]))
      .mockReturnValueOnce(makeSelectChain([]));
    const res = await GET({} as Request, makeParams("d1"));
    expect(res.status).toBe(404);
  });

  it("returns 404 when dashboard belongs to different tenant", async () => {
    mockRequireSession.mockResolvedValue({
      ...SESSION,
      tenantId: "tenant-other",
    });
    const chain = makeSelectChain([]);
    mockDb.select.mockReturnValue(chain);
    const res = await GET({} as Request, makeParams("d1"));
    expect(res.status).toBe(404);
    // The 404 is only meaningful if the lookup asked for the session tenant.
    expect(chain.calls.where).toHaveLength(1);
    expectScopedById(chain.calls.where[0], "tenant-other");
  });

  it("returns public dashboard as viewer for any authenticated user", async () => {
    mockRequireSession.mockResolvedValue({ ...SESSION, userId: "user-2" });
    const publicDashboard = { ...OWNER_DASHBOARD, isPublic: true };
    // First select: dashboard lookup — found with isPublic=true
    // Second select: share lookup — no share found
    mockDb.select
      .mockReturnValueOnce(makeSelectChain([publicDashboard]))
      .mockReturnValueOnce(makeSelectChain([]))
      // Third select: the updatedByName lookup — see the note above.
      .mockReturnValue(makeSelectChain([{ updatedByName: "Alice" }]));
    const res = await GET({} as Request, makeParams("d1"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.role).toBe("viewer");
  });

  it("returns 404 for private dashboard without share", async () => {
    mockRequireSession.mockResolvedValue({ ...SESSION, userId: "user-2" });
    const privateDashboard = { ...OWNER_DASHBOARD, isPublic: false };
    mockDb.select
      .mockReturnValueOnce(makeSelectChain([privateDashboard]))
      .mockReturnValueOnce(makeSelectChain([]));
    const res = await GET({} as Request, makeParams("d1"));
    expect(res.status).toBe(404);
  });

  it("returns dashboard for admin (bypasses per-dashboard ACL)", async () => {
    mockRequireSession.mockResolvedValue({
      ...SESSION,
      userId: "admin-1",
      role: "admin",
    });
    mockDb.select.mockReturnValue(makeSelectChain([OWNER_DASHBOARD]));
    const res = await GET({} as Request, makeParams("d1"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.role).toBe("admin");
  });

  it("returns updatedByName when updatedBy is set", async () => {
    mockRequireSession.mockResolvedValue(SESSION);
    const dashWithUpdater = { ...OWNER_DASHBOARD, updatedBy: "user-1" };
    // First select: canAccess finds the dashboard
    // Second select: tenant-scoped LEFT JOIN to resolve updater name
    mockDb.select
      .mockReturnValueOnce(makeSelectChain([dashWithUpdater]))
      .mockReturnValueOnce(makeSelectChain([{ updatedByName: "Alice" }]));
    const res = await GET({} as Request, makeParams("d1"));
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      data: { updatedByName: string | null };
    };
    expect(body.data.updatedByName).toBe("Alice");
  });

  it("returns updatedByName as null when updatedBy is not set", async () => {
    mockRequireSession.mockResolvedValue(SESSION);
    // First select: canAccess. Second select: LEFT JOIN returns null updatedByName
    mockDb.select
      .mockReturnValueOnce(makeSelectChain([OWNER_DASHBOARD]))
      .mockReturnValueOnce(makeSelectChain([{ updatedByName: null }]));
    const res = await GET({} as Request, makeParams("d1"));
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      data: { updatedByName: string | null };
    };
    expect(body.data.updatedByName).toBeNull();
  });
});

describe("PUT /api/dashboards/[id]", () => {
  let PUT: (
    req: Request,
    ctx: { params: Promise<{ id: string }> },
  ) => Promise<Response>;

  beforeEach(async () => {
    vi.resetModules();
    vi.clearAllMocks();
    resetDbMock(mockDb);
    const mod = await import("../route");
    PUT = mod.PUT;
  });

  it("returns 401 when unauthenticated", async () => {
    mockRequireSession.mockRejectedValue(new UnauthorizedError());
    const res = await PUT(makeRequest({ name: "New name" }), makeParams("d1"));
    expect(res.status).toBe(401);
  });

  it("returns 403 for reader role", async () => {
    mockRequireSession.mockResolvedValue({
      ...SESSION,
      canWrite: false,
      role: "reader",
    });
    const res = await PUT(makeRequest({ name: "New name" }), makeParams("d1"));
    expect(res.status).toBe(403);
  });

  it("returns 403 when canWrite is false even for creator role", async () => {
    mockRequireSession.mockResolvedValue({
      ...SESSION,
      canWrite: false,
      role: "creator",
    });
    const res = await PUT(makeRequest({ name: "New name" }), makeParams("d1"));
    expect(res.status).toBe(403);
  });

  it("returns 404 when not owner/editor", async () => {
    mockRequireSession.mockResolvedValue(SESSION);
    mockDb.select.mockReturnValue(makeSelectChain([]));
    const res = await PUT(makeRequest({ name: "New name" }), makeParams("d1"));
    expect(res.status).toBe(404);
  });

  it("returns 403 (not 404) for a viewer-share write — may view, not write (#1056)", async () => {
    mockRequireSession.mockResolvedValue({ ...SESSION, userId: "user-2" });
    const sharedDashboard = { ...OWNER_DASHBOARD, userId: "user-1" };
    const viewerShare = {
      dashboardId: "d1",
      userId: "user-2",
      tenantId: "tenant-1",
      role: "viewer",
    };
    // canAccess(editor): dashboard + viewer share → null (needs editor).
    // canAccess(viewer): dashboard + viewer share → access → 403.
    mockDb.select
      .mockReturnValueOnce(makeSelectChain([sharedDashboard]))
      .mockReturnValueOnce(makeSelectChain([viewerShare]))
      .mockReturnValueOnce(makeSelectChain([sharedDashboard]))
      .mockReturnValueOnce(makeSelectChain([viewerShare]));
    const res = await PUT(makeRequest({ name: "New name" }), makeParams("d1"));
    expect(res.status).toBe(403);
  });

  it("updates dashboard and returns 200", async () => {
    mockRequireSession.mockResolvedValue(SESSION);
    mockDb.select.mockReturnValue(makeSelectChain([OWNER_DASHBOARD]));
    const updated = { ...OWNER_DASHBOARD, name: "New name" };
    const chain = makeUpdateChain([updated]);
    mockDb.update.mockReturnValue(chain);

    const res = await PUT(makeRequest({ name: "New name" }), makeParams("d1"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.name).toBe("New name");
    expect(chain.calls.where).toHaveLength(1);
    expectScopedById(chain.calls.where[0]);
  });

  it("sets updatedBy to session userId on update", async () => {
    mockRequireSession.mockResolvedValue(SESSION);
    mockDb.select.mockReturnValue(makeSelectChain([OWNER_DASHBOARD]));
    const updated = {
      ...OWNER_DASHBOARD,
      name: "Updated",
      updatedBy: "user-1",
    };
    const chain = makeUpdateChain([updated]);
    mockDb.update.mockReturnValue(chain);

    const res = await PUT(makeRequest({ name: "Updated" }), makeParams("d1"));
    expect(res.status).toBe(200);
    expect(chain.calls.set[0][0]).toMatchObject({ updatedBy: "user-1" });
  });

  it("updates tags alone — trimmed, deduped, tenant-scoped (#1692)", async () => {
    mockRequireSession.mockResolvedValue(SESSION);
    mockDb.select.mockReturnValue(makeSelectChain([OWNER_DASHBOARD]));
    const chain = makeUpdateChain([
      { ...OWNER_DASHBOARD, tags: ["sales", "kpi"] },
    ]);
    mockDb.update.mockReturnValue(chain);

    const res = await PUT(
      makeRequest({ tags: [" sales ", "kpi", "sales"] }),
      makeParams("d1"),
    );
    expect(res.status).toBe(200);
    expect(chain.calls.set[0][0]).toMatchObject({ tags: ["sales", "kpi"] });
    expectScopedById(chain.calls.where[0]);
  });

  it("returns 400 when tags exceed the limits (#1692)", async () => {
    mockRequireSession.mockResolvedValue(SESSION);
    mockDb.select.mockReturnValue(makeSelectChain([OWNER_DASHBOARD]));
    const tooMany = Array.from({ length: 11 }, (_, i) => `t${i}`);
    expect(
      (await PUT(makeRequest({ tags: tooMany }), makeParams("d1"))).status,
    ).toBe(400);
    expect(
      (await PUT(makeRequest({ tags: ["x".repeat(31)] }), makeParams("d1")))
        .status,
    ).toBe(400);
    expect(mockDb.update).not.toHaveBeenCalled();
  });

  it("returns 400 when request body is invalid", async () => {
    mockRequireSession.mockResolvedValue(SESSION);
    mockDb.select.mockReturnValue(makeSelectChain([OWNER_DASHBOARD]));
    const res = await PUT(makeRequest({ name: "" }), makeParams("d1"));
    expect(res.status).toBe(400);
  });

  it("returns 404 when public dashboard is edited by non-owner", async () => {
    mockRequireSession.mockResolvedValue({ ...SESSION, userId: "user-2" });
    const publicDashboard = { ...OWNER_DASHBOARD, isPublic: true };
    // canAccess("editor"): dashboard found, no share → public only grants
    // viewer → null. Then the viewer fallback runs with allowPublic=false,
    // so a public-but-unshared dashboard still resolves to null → 404 (we
    // don't surface per-dashboard writability for public dashboards) (#1056).
    mockDb.select
      .mockReturnValueOnce(makeSelectChain([publicDashboard]))
      .mockReturnValueOnce(makeSelectChain([]))
      .mockReturnValueOnce(makeSelectChain([publicDashboard]))
      .mockReturnValueOnce(makeSelectChain([]));
    const res = await PUT(makeRequest({ name: "Hacked" }), makeParams("d1"));
    expect(res.status).toBe(404);
  });

  it("returns 400 when refreshIntervalSeconds is below 5", async () => {
    mockRequireSession.mockResolvedValue(SESSION);
    mockDb.select.mockReturnValue(makeSelectChain([OWNER_DASHBOARD]));
    const layout = {
      version: 2,
      pages: [{ id: "p1", title: "Page 1", widgets: [], gridLayout: [] }],
      settings: { autoRefresh: true, refreshIntervalSeconds: 4 },
    };
    const res = await PUT(
      makeRequest({ layoutJson: layout }),
      makeParams("d1"),
    );
    expect(res.status).toBe(400);
  });

  it("accepts refreshIntervalSeconds of 5 (minimum)", async () => {
    mockRequireSession.mockResolvedValue(SESSION);
    mockDb.select.mockReturnValue(makeSelectChain([OWNER_DASHBOARD]));
    const layout = {
      version: 2,
      pages: [{ id: "p1", title: "Page 1", widgets: [], gridLayout: [] }],
      settings: { autoRefresh: true, refreshIntervalSeconds: 5 },
    };
    const updated = { ...OWNER_DASHBOARD, layoutJson: layout };
    mockDb.update.mockReturnValue(makeUpdateChain([updated]));
    const res = await PUT(
      makeRequest({ layoutJson: layout }),
      makeParams("d1"),
    );
    expect(res.status).toBe(200);
  });

  it("updates layout with v2 pages schema", async () => {
    mockRequireSession.mockResolvedValue(SESSION);
    mockDb.select.mockReturnValue(makeSelectChain([OWNER_DASHBOARD]));
    const layout = {
      version: 2,
      pages: [
        {
          id: "p1",
          title: "Page 1",
          widgets: [
            {
              id: "w1",
              chartType: "bar",
              connectionId: "c1",
              query: "MATCH (n) RETURN n",
            },
          ],
          gridLayout: [{ i: "w1", x: 0, y: 0, w: 4, h: 3 }],
        },
      ],
    };
    const updated = { ...OWNER_DASHBOARD, layoutJson: layout };
    mockDb.update.mockReturnValue(makeUpdateChain([updated]));
    const res = await PUT(
      makeRequest({ layoutJson: layout }),
      makeParams("d1"),
    );
    expect(res.status).toBe(200);
  });
});

describe("DELETE /api/dashboards/[id]", () => {
  let DELETE: (
    req: Request,
    ctx: { params: Promise<{ id: string }> },
  ) => Promise<Response>;

  beforeEach(async () => {
    vi.resetModules();
    vi.clearAllMocks();
    resetDbMock(mockDb);
    const mod = await import("../route");
    DELETE = mod.DELETE;
  });

  it("returns 401 when unauthenticated", async () => {
    mockRequireSession.mockRejectedValue(new UnauthorizedError());
    const res = await DELETE({} as Request, makeParams("d1"));
    expect(res.status).toBe(401);
  });

  it("returns 403 for reader role", async () => {
    mockRequireSession.mockResolvedValue({
      ...SESSION,
      canWrite: false,
      role: "reader",
    });
    const res = await DELETE({} as Request, makeParams("d1"));
    expect(res.status).toBe(403);
  });

  it("returns 403 when canWrite is false even for creator role", async () => {
    mockRequireSession.mockResolvedValue({
      ...SESSION,
      canWrite: false,
      role: "creator",
    });
    const res = await DELETE({} as Request, makeParams("d1"));
    expect(res.status).toBe(403);
  });

  it("returns 404 when not owner (creator role)", async () => {
    mockRequireSession.mockResolvedValue(SESSION);
    mockDb.select.mockReturnValue(makeSelectChain([]));
    const res = await DELETE({} as Request, makeParams("d1"));
    expect(res.status).toBe(404);
  });

  it("deletes dashboard and returns success", async () => {
    mockRequireSession.mockResolvedValue(SESSION);
    const selectChain = makeSelectChain([OWNER_DASHBOARD]);
    const deleteChain = makeDeleteChain();
    mockDb.select.mockReturnValue(selectChain);
    mockDb.delete.mockReturnValue(deleteChain);
    const res = await DELETE({} as Request, makeParams("d1"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.deleted).toBe(true);
    // Owner check, then the DELETE itself — both scoped by tenant.
    expectScopedById(selectChain.calls.where[0]);
    expect(deleteChain.calls.where).toHaveLength(1);
    expectScopedById(deleteChain.calls.where[0]);
  });

  it("returns 404 when dashboard belongs to different tenant", async () => {
    mockRequireSession.mockResolvedValue({
      ...SESSION,
      tenantId: "tenant-other",
    });
    const chain = makeSelectChain([]);
    mockDb.select.mockReturnValue(chain);
    const res = await DELETE({} as Request, makeParams("d1"));
    expect(res.status).toBe(404);
    expect(mockDb.delete).not.toHaveBeenCalled();
    expectScopedById(chain.calls.where[0], "tenant-other");
  });

  it("allows admin to delete any dashboard in the tenant", async () => {
    mockRequireSession.mockResolvedValue({
      ...SESSION,
      userId: "admin-1",
      role: "admin",
    });
    const selectChain = makeSelectChain([{ id: "d1" }]);
    const deleteChain = makeDeleteChain();
    mockDb.select.mockReturnValue(selectChain);
    mockDb.delete.mockReturnValue(deleteChain);
    const res = await DELETE({} as Request, makeParams("d1"));
    expect(res.status).toBe(200);
    // "Any dashboard" still means any dashboard in the admin's tenant: the
    // admin existence check and the DELETE both carry the tenant filter.
    expect(selectChain.calls.where).toHaveLength(1);
    expectScopedById(selectChain.calls.where[0]);
    expectScopedById(deleteChain.calls.where[0]);
  });
});

describe("PUT /api/dashboards/[id] — optimistic locking", () => {
  let PUT: (
    req: Request,
    ctx: { params: Promise<{ id: string }> },
  ) => Promise<Response>;

  beforeEach(async () => {
    vi.resetModules();
    vi.clearAllMocks();
    resetDbMock(mockDb);
    const mod = await import("../route");
    PUT = mod.PUT;
  });

  // TODO: Add E2E conflict detection test (two browser contexts editing
  // the same dashboard, second save gets 409). Deferred from this PR.

  it("returns 409 when expectedVersion does not match (version conflict)", async () => {
    mockRequireSession.mockResolvedValue(SESSION);
    // canAccess check passes — OWNER_DASHBOARD has version: 3
    mockDb.select.mockReturnValue(makeSelectChain([OWNER_DASHBOARD]));
    // update returns empty — version mismatch (client sent 2, server has 3)
    const chain = makeUpdateChain([]);
    mockDb.update.mockReturnValue(chain);

    const res = await PUT(
      makeRequest({
        layoutJson: {
          version: 2,
          pages: [{ id: "p1", title: "P", widgets: [], gridLayout: [] }],
        },
        expectedVersion: 2, // stale — server has version 3
      }),
      makeParams("d1"),
    );
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error.message).toMatch(/modified by someone else/i);
    // The lock rides on the same WHERE as the id + tenant scope.
    const [expr] = chain.calls.where[0];
    expect(sqlColumns(expr)).toEqual(
      expect.arrayContaining(["id", "tenant_id", "version"]),
    );
    expect(sqlValues(expr)).toEqual(
      expect.arrayContaining(["d1", "tenant-1", 2]),
    );
  });

  it("succeeds and increments version when expectedVersion matches", async () => {
    mockRequireSession.mockResolvedValue(SESSION);
    mockDb.select.mockReturnValue(makeSelectChain([OWNER_DASHBOARD]));
    mockDb.update.mockReturnValue(
      makeUpdateChain([{ id: "d1", version: 4, name: "Updated" }]),
    );

    const res = await PUT(
      makeRequest({
        name: "Updated",
        expectedVersion: 3,
      }),
      makeParams("d1"),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.version).toBe(4);
  });

  it("succeeds without expectedVersion (backwards-compatible)", async () => {
    mockRequireSession.mockResolvedValue(SESSION);
    mockDb.select.mockReturnValue(makeSelectChain([OWNER_DASHBOARD]));
    mockDb.update.mockReturnValue(
      makeUpdateChain([{ id: "d1", version: 2, name: "Updated" }]),
    );

    const res = await PUT(makeRequest({ name: "Updated" }), makeParams("d1"));
    expect(res.status).toBe(200);
  });

  it("rejects unknown body keys (e.g. stale thumbnailJson) with 400", async () => {
    mockRequireSession.mockResolvedValue(SESSION);
    mockDb.select.mockReturnValue(makeSelectChain([OWNER_DASHBOARD]));
    // A stale client sending the removed thumbnailJson field must 400 rather
    // than silently parsing as an empty update (which would still touch
    // updatedAt/updatedBy and bump version on a no-op).
    const res = await PUT(
      makeRequest({ thumbnailJson: { w1: "data:image/jpeg;base64,AAA" } }),
      makeParams("d1"),
    );
    expect(res.status).toBe(400);
    expect(mockDb.update).not.toHaveBeenCalled();
  });

  it("rejects an empty update body with 400", async () => {
    mockRequireSession.mockResolvedValue(SESSION);
    mockDb.select.mockReturnValue(makeSelectChain([OWNER_DASHBOARD]));
    const res = await PUT(makeRequest({}), makeParams("d1"));
    expect(res.status).toBe(400);
    expect(mockDb.update).not.toHaveBeenCalled();
  });

  it("rejects an expectedVersion-only body (no data fields) with 400", async () => {
    mockRequireSession.mockResolvedValue(SESSION);
    mockDb.select.mockReturnValue(makeSelectChain([OWNER_DASHBOARD]));
    // expectedVersion is an optimistic-lock guard, not a data field — a body
    // carrying only the lock has nothing to persist and must not bump version.
    const res = await PUT(
      makeRequest({ expectedVersion: 3 }),
      makeParams("d1"),
    );
    expect(res.status).toBe(400);
    expect(mockDb.update).not.toHaveBeenCalled();
  });
});
