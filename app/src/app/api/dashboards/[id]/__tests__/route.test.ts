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
    // c1 is new to this dashboard, so the save first asks whether the caller
    // may use it. An empty answer: nothing is out of reach (#1816).
    const connectionCheck = makeSelectChain([]);
    mockDb.select
      .mockReturnValueOnce(makeSelectChain([OWNER_DASHBOARD]))
      .mockReturnValueOnce(connectionCheck);
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
    expect(connectionCheck.calls.where).toHaveLength(1);
  });

  // A dashboard's owner and editors may run any read query on the connections
  // it names (#972), so a save must not add a connection the caller cannot use
  // directly: their own, one shared with the tenant, or any for an admin. A
  // connection already on this dashboard stays, so editors keep working on it
  // (#1816).
  function layoutOn(
    connectionId: string,
    query = "MATCH (n) RETURN n",
    database?: string,
  ) {
    return {
      version: 2,
      pages: [
        {
          id: "p1",
          title: "Page 1",
          widgets: [
            { id: "w1", chartType: "table", connectionId, query, database },
          ],
          gridLayout: [{ i: "w1", x: 0, y: 0, w: 4, h: 3 }],
        },
      ],
    };
  }

  it("returns 403 when the layout adds a connection the caller cannot use (#1816)", async () => {
    mockRequireSession.mockResolvedValue(SESSION);
    const connectionCheck = makeSelectChain([{ id: "c-private" }]);
    mockDb.select
      .mockReturnValueOnce(makeSelectChain([OWNER_DASHBOARD]))
      .mockReturnValueOnce(connectionCheck);
    mockDb.update.mockReturnValue(makeUpdateChain([OWNER_DASHBOARD]));

    const res = await PUT(
      makeRequest({ layoutJson: layoutOn("c-private") }),
      makeParams("d1"),
    );

    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error.message).toMatch(/connection/i);
    expect(mockDb.update).not.toHaveBeenCalled();
    expect(connectionCheck.calls.where).toHaveLength(1);
    const [expr] = connectionCheck.calls.where[0];
    expect(sqlColumns(expr)).toEqual(
      expect.arrayContaining(["tenant_id", "id", "userId", "visibility"]),
    );
    expect(sqlValues(expr)).toEqual(
      expect.arrayContaining(["tenant-1", "c-private", "user-1", "shared"]),
    );
  });

  it("lets an editor share save new queries on a connection the dashboard's owner can use (#1816)", async () => {
    mockRequireSession.mockResolvedValue({ ...SESSION, userId: "user-2" });
    const stored = { ...OWNER_DASHBOARD, layoutJson: layoutOn("c-owner") };
    const editorShare = {
      dashboardId: "d1",
      userId: "user-2",
      tenantId: "tenant-1",
      role: "editor",
    };
    mockDb.select
      .mockReturnValueOnce(makeSelectChain([stored]))
      .mockReturnValueOnce(makeSelectChain([editorShare]))
      // user-2 cannot use c-owner directly...
      .mockReturnValueOnce(makeSelectChain([{ id: "c-owner" }]))
      // ...but the dashboard's owner, a creator, can.
      .mockReturnValueOnce(makeSelectChain([{ role: "creator" }]))
      .mockReturnValueOnce(makeSelectChain([]));
    const next = layoutOn("c-owner", "MATCH (m:Movie) RETURN m.title");
    mockDb.update.mockReturnValue(
      makeUpdateChain([{ ...stored, layoutJson: next }]),
    );

    const res = await PUT(makeRequest({ layoutJson: next }), makeParams("d1"));

    expect(res.status).toBe(200);
    expect(mockDb.select).toHaveBeenCalledTimes(5);
  });

  it("lets an admin add any connection without a lookup (#1816)", async () => {
    mockRequireSession.mockResolvedValue({ ...SESSION, role: "admin" });
    mockDb.select.mockReturnValueOnce(makeSelectChain([OWNER_DASHBOARD]));
    mockDb.update.mockReturnValue(makeUpdateChain([OWNER_DASHBOARD]));

    const res = await PUT(
      makeRequest({ layoutJson: layoutOn("c-anyone") }),
      makeParams("d1"),
    );

    expect(res.status).toBe(200);
    expect(mockDb.select).toHaveBeenCalledTimes(1);
  });

  const EDITOR_SHARE = {
    dashboardId: "d1",
    userId: "user-2",
    tenantId: "tenant-1",
    role: "editor",
  };

  it("refuses an editor share adding a connection the dashboard does not name (#1816)", async () => {
    mockRequireSession.mockResolvedValue({ ...SESSION, userId: "user-2" });
    const stored = { ...OWNER_DASHBOARD, layoutJson: layoutOn("c-owner") };
    mockDb.select
      .mockReturnValueOnce(makeSelectChain([stored]))
      .mockReturnValueOnce(makeSelectChain([EDITOR_SHARE]))
      .mockReturnValueOnce(makeSelectChain([{ id: "c-zed" }]));
    mockDb.update.mockReturnValue(makeUpdateChain([stored]));

    const res = await PUT(
      makeRequest({ layoutJson: layoutOn("c-zed") }),
      makeParams("d1"),
    );

    expect(res.status).toBe(403);
    expect(mockDb.update).not.toHaveBeenCalled();
  });

  it("refuses an added connection when the save sends expectedVersion too (#1816)", async () => {
    mockRequireSession.mockResolvedValue(SESSION);
    mockDb.select
      .mockReturnValueOnce(makeSelectChain([OWNER_DASHBOARD]))
      .mockReturnValueOnce(makeSelectChain([{ id: "c-private" }]));
    mockDb.update.mockReturnValue(makeUpdateChain([OWNER_DASHBOARD]));

    const res = await PUT(
      makeRequest({ layoutJson: layoutOn("c-private"), expectedVersion: 3 }),
      makeParams("d1"),
    );

    expect(res.status).toBe(403);
    expect(mockDb.update).not.toHaveBeenCalled();
  });

  // Once a dashboard's owner cannot use a connection on it, the query route
  // binds its owner and editors to the saved queries. That binding reads the
  // saved layout, so no save may add a query while the connection stays on it.
  const NEW_QUERY = "MATCH (p:Person) RETURN p.name";

  it("refuses a new query from an owner whose dashboard names a connection they cannot use (#1816)", async () => {
    mockRequireSession.mockResolvedValue(SESSION);
    const stored = { ...OWNER_DASHBOARD, layoutJson: layoutOn("c-alice") };
    mockDb.select
      .mockReturnValueOnce(makeSelectChain([stored]))
      .mockReturnValueOnce(makeSelectChain([{ id: "c-alice" }]));
    mockDb.update.mockReturnValue(makeUpdateChain([stored]));

    const res = await PUT(
      makeRequest({ layoutJson: layoutOn("c-alice", NEW_QUERY) }),
      makeParams("d1"),
    );

    expect(res.status).toBe(403);
    expect((await res.json()).error.message).toMatch(/connection/i);
    expect(mockDb.update).not.toHaveBeenCalled();
  });

  it("refuses a new query from an editor share once the dashboard's owner cannot use the connection (#1816)", async () => {
    mockRequireSession.mockResolvedValue({ ...SESSION, userId: "user-2" });
    const stored = { ...OWNER_DASHBOARD, layoutJson: layoutOn("c-alice") };
    const ownerLookup = makeSelectChain([{ role: "creator" }]);
    mockDb.select
      .mockReturnValueOnce(makeSelectChain([stored]))
      .mockReturnValueOnce(makeSelectChain([EDITOR_SHARE]))
      .mockReturnValueOnce(makeSelectChain([{ id: "c-alice" }]))
      .mockReturnValueOnce(ownerLookup)
      .mockReturnValueOnce(makeSelectChain([{ id: "c-alice" }]));
    mockDb.update.mockReturnValue(makeUpdateChain([stored]));

    const res = await PUT(
      makeRequest({ layoutJson: layoutOn("c-alice", NEW_QUERY) }),
      makeParams("d1"),
    );

    expect(res.status).toBe(403);
    expect(mockDb.update).not.toHaveBeenCalled();
    // The owner's role is read in the session tenant.
    expectScopedById(ownerLookup.calls.where[0], "tenant-1", "user-1");
  });

  it("lets that owner rearrange the dashboard without a lookup (#1816)", async () => {
    mockRequireSession.mockResolvedValue(SESSION);
    const stored = { ...OWNER_DASHBOARD, layoutJson: layoutOn("c-alice") };
    mockDb.select.mockReturnValueOnce(makeSelectChain([stored]));
    const moved = layoutOn("c-alice");
    moved.pages[0].gridLayout = [{ i: "w1", x: 4, y: 2, w: 6, h: 4 }];
    mockDb.update.mockReturnValue(
      makeUpdateChain([{ ...stored, layoutJson: moved }]),
    );

    const res = await PUT(makeRequest({ layoutJson: moved }), makeParams("d1"));

    expect(res.status).toBe(200);
    expect(mockDb.select).toHaveBeenCalledTimes(1);
  });

  // The binding matches a query with its connection and database (#1822), so
  // a save that moves a saved query to another database adds a query here.
  it("refuses a bound owner moving a saved query to another database (#1822)", async () => {
    mockRequireSession.mockResolvedValue(SESSION);
    const stored = { ...OWNER_DASHBOARD, layoutJson: layoutOn("c-alice") };
    mockDb.select
      .mockReturnValueOnce(makeSelectChain([stored]))
      .mockReturnValueOnce(makeSelectChain([{ id: "c-alice" }]));
    mockDb.update.mockReturnValue(makeUpdateChain([stored]));

    const res = await PUT(
      makeRequest({
        layoutJson: layoutOn("c-alice", "MATCH (n) RETURN n", "archive"),
      }),
      makeParams("d1"),
    );

    expect(res.status).toBe(403);
    expect(mockDb.update).not.toHaveBeenCalled();
  });

  it("lets an owner who can use the connection move a query to another database (#1822)", async () => {
    mockRequireSession.mockResolvedValue(SESSION);
    const stored = { ...OWNER_DASHBOARD, layoutJson: layoutOn("c-own") };
    const connectionCheck = makeSelectChain([]);
    mockDb.select
      .mockReturnValueOnce(makeSelectChain([stored]))
      .mockReturnValueOnce(connectionCheck);
    const next = layoutOn("c-own", "MATCH (n) RETURN n", "archive");
    mockDb.update.mockReturnValue(
      makeUpdateChain([{ ...stored, layoutJson: next }]),
    );

    const res = await PUT(makeRequest({ layoutJson: next }), makeParams("d1"));

    expect(res.status).toBe(200);
    expect(connectionCheck.calls.where).toHaveLength(1);
  });

  /** w1 on the owner's unusable c-alice, w2 on c-own, which the owner can use. */
  function twoConnections(
    aliceQuery: string,
    own: { query?: string; database?: string } = {},
  ) {
    return {
      version: 2,
      pages: [
        {
          id: "p1",
          title: "Page 1",
          widgets: [
            {
              id: "w1",
              chartType: "table",
              connectionId: "c-alice",
              query: aliceQuery,
            },
            {
              id: "w2",
              chartType: "table",
              connectionId: "c-own",
              query: own.query ?? "MATCH (b) RETURN b",
              database: own.database,
            },
          ],
          gridLayout: [
            { i: "w1", x: 0, y: 0, w: 4, h: 3 },
            { i: "w2", x: 4, y: 0, w: 4, h: 3 },
          ],
        },
      ],
    };
  }

  it("refuses a bound owner copying a saved query onto a connection they cannot use (#1822)", async () => {
    mockRequireSession.mockResolvedValue(SESSION);
    const stored = {
      ...OWNER_DASHBOARD,
      layoutJson: twoConnections("MATCH (a) RETURN a"),
    };
    mockDb.select
      .mockReturnValueOnce(makeSelectChain([stored]))
      .mockReturnValueOnce(makeSelectChain([{ id: "c-alice" }]));
    mockDb.update.mockReturnValue(makeUpdateChain([stored]));

    // w2's query, already saved on c-own, becomes w1's query on c-alice.
    const res = await PUT(
      makeRequest({ layoutJson: twoConnections("MATCH (b) RETURN b") }),
      makeParams("d1"),
    );

    expect(res.status).toBe(403);
    expect(mockDb.update).not.toHaveBeenCalled();
  });

  // Moving a query to another database adds a query even on a connection the
  // owner can use, so it is refused while c-alice stays on the dashboard, as
  // any new query is (#1816).
  it("refuses a bound owner moving a query to another database on a usable connection (#1822)", async () => {
    mockRequireSession.mockResolvedValue(SESSION);
    const stored = {
      ...OWNER_DASHBOARD,
      layoutJson: twoConnections("MATCH (a) RETURN a"),
    };
    mockDb.select
      .mockReturnValueOnce(makeSelectChain([stored]))
      .mockReturnValueOnce(makeSelectChain([{ id: "c-alice" }]));
    mockDb.update.mockReturnValue(makeUpdateChain([stored]));

    const res = await PUT(
      makeRequest({
        layoutJson: twoConnections("MATCH (a) RETURN a", {
          database: "archive",
        }),
      }),
      makeParams("d1"),
    );

    expect(res.status).toBe(403);
    expect(mockDb.update).not.toHaveBeenCalled();
  });

  // The binding matches a query's exact saved text, so a save that changes only
  // a saved query's whitespace adds a query here too.
  it("refuses a bound owner changing only a saved query's whitespace", async () => {
    mockRequireSession.mockResolvedValue(SESSION);
    const stored = {
      ...OWNER_DASHBOARD,
      layoutJson: layoutOn("c-alice", "MATCH (n)\nRETURN n"),
    };
    mockDb.select
      .mockReturnValueOnce(makeSelectChain([stored]))
      .mockReturnValueOnce(makeSelectChain([{ id: "c-alice" }]));
    mockDb.update.mockReturnValue(makeUpdateChain([stored]));

    const res = await PUT(
      makeRequest({ layoutJson: layoutOn("c-alice", "MATCH (n) RETURN n") }),
      makeParams("d1"),
    );

    expect(res.status).toBe(403);
    expect(mockDb.update).not.toHaveBeenCalled();
  });

  // A saved form writes through its connection for everyone who can open the
  // dashboard (#1831). So a save that adds a form, turns a widget into one, or
  // changes a form's query, connection or database needs the saver's own access
  // to that connection, even one the dashboard already names. A form left as
  // stored stays, whoever saves.
  describe("forms (#1831)", () => {
    const FORM_REFUSAL =
      "You can only add or change forms on connections you have access to";

    /** w-form, on the owner's private c-alice and database neoboard. */
    const form = (widget: Record<string, unknown> = {}) => ({
      id: "w-form",
      chartType: "form",
      connectionId: "c-alice",
      query: "CREATE (t:Tag {tag: $param_tag})",
      database: "neoboard",
      settings: { title: "Tags" },
      ...widget,
    });
    const table = {
      id: "w-table",
      chartType: "table",
      connectionId: "c-alice",
      query: "MATCH (t:Tag) RETURN t",
    };
    const layoutOf = (...widgets: Record<string, unknown>[]) => ({
      version: 2,
      pages: [
        {
          id: "p1",
          title: "Page 1",
          widgets,
          gridLayout: widgets.map((widget, i) => ({
            i: String(widget.id),
            x: i * 4,
            y: 0,
            w: 4,
            h: 3,
          })),
        },
      ],
    });

    /**
     * user-2, an editor share, saves over `stored`. The selects are queued as
     * the #1816 check reads them on a save it lets through: the dashboard, the
     * share, user-2's access (none to c-alice), the owner's role and the
     * owner's access (all of it). Returns the lookup of user-2's access.
     */
    function editorSavesOver(stored: unknown) {
      mockRequireSession.mockResolvedValue({ ...SESSION, userId: "user-2" });
      const saverAccess = makeSelectChain([{ id: "c-alice" }]);
      mockDb.select
        .mockReturnValueOnce(
          makeSelectChain([{ ...OWNER_DASHBOARD, layoutJson: stored }]),
        )
        .mockReturnValueOnce(makeSelectChain([EDITOR_SHARE]))
        .mockReturnValueOnce(saverAccess)
        .mockReturnValueOnce(makeSelectChain([{ role: "creator" }]))
        .mockReturnValueOnce(makeSelectChain([]));
      mockDb.update.mockReturnValue(makeUpdateChain([OWNER_DASHBOARD]));
      return saverAccess;
    }

    /**
     * The owner, user-1, saves over `stored` without access to c-alice: the
     * dashboard, then user-1's access (none to c-alice).
     */
    function ownerSavesOver(stored: unknown) {
      mockRequireSession.mockResolvedValue(SESSION);
      const saverAccess = makeSelectChain([{ id: "c-alice" }]);
      mockDb.select
        .mockReturnValueOnce(
          makeSelectChain([{ ...OWNER_DASHBOARD, layoutJson: stored }]),
        )
        .mockReturnValueOnce(saverAccess);
      mockDb.update.mockReturnValue(makeUpdateChain([OWNER_DASHBOARD]));
      return saverAccess;
    }

    const SAVERS = [
      ["an editor share", "user-2", editorSavesOver],
      ["the dashboard's owner", "user-1", ownerSavesOver],
    ] as const;

    const REFUSALS: [string, unknown, unknown][] = [
      ["adds a form", layoutOf(table), layoutOf(table, form())],
      [
        "copies a form under a new id",
        layoutOf(form()),
        layoutOf(form(), form({ id: "w-copy" })),
      ],
      [
        "turns a table into a form",
        layoutOf(form({ chartType: "table" })),
        layoutOf(form()),
      ],
      [
        "changes a form's query",
        layoutOf(form()),
        layoutOf(form({ query: "MATCH (t:Tag) DETACH DELETE t" })),
      ],
      [
        "changes a form's database",
        layoutOf(form()),
        layoutOf(form({ database: "archive" })),
      ],
      [
        "moves a form onto it from another connection",
        layoutOf(table, form({ connectionId: "c-bob" })),
        layoutOf(table, form()),
      ],
      [
        "hides a changed copy under the form's id before the original",
        layoutOf(form()),
        layoutOf(form({ query: "MATCH (t:Tag) DETACH DELETE t" }), form()),
      ],
    ];

    it.each(
      SAVERS.flatMap(([saver, userId, savesOver]) =>
        REFUSALS.map(
          ([what, stored, next]) =>
            [saver, what, userId, savesOver, stored, next] as const,
        ),
      ),
    )(
      "refuses %s without access to the form's connection who %s",
      async (_saver, _what, userId, savesOver, stored, next) => {
        const saverAccess = savesOver(stored);

        const res = await PUT(
          makeRequest({ layoutJson: next }),
          makeParams("d1"),
        );

        expect(res.status).toBe(403);
        expect((await res.json()).error.message).toBe(FORM_REFUSAL);
        expect(mockDb.update).not.toHaveBeenCalled();
        const [expr] = saverAccess.calls.where[0];
        expect(sqlValues(expr)).toEqual(
          expect.arrayContaining(["tenant-1", "c-alice", userId, "shared"]),
        );
      },
    );

    it("pins a layout save without expectedVersion to the version its checks read", async () => {
      editorSavesOver(layoutOf(table, form()));
      const chain = makeUpdateChain([OWNER_DASHBOARD]);
      mockDb.update.mockReturnValue(chain);

      const res = await PUT(
        makeRequest({ layoutJson: layoutOf(form(), table) }),
        makeParams("d1"),
      );

      expect(res.status).toBe(200);
      // A save that lands between the read and the update makes this a 409,
      // so a layout the checks never saw cannot be written over it.
      const [expr] = chain.calls.where[0];
      expect(sqlColumns(expr)).toEqual(["id", "tenant_id", "version"]);
      expect(sqlValues(expr)).toEqual(
        expect.arrayContaining(["d1", "tenant-1", 3]),
      );
    });

    it("lets that editor move a form to another page, resize and rename it, with no lookup", async () => {
      editorSavesOver(layoutOf(table, form()));
      const next = {
        version: 2,
        pages: [
          {
            id: "p1",
            title: "Page 1",
            widgets: [table],
            gridLayout: [{ i: "w-table", x: 0, y: 0, w: 4, h: 3 }],
          },
          {
            id: "p2",
            title: "Page 2",
            widgets: [form({ settings: { title: "Renamed" } })],
            gridLayout: [{ i: "w-form", x: 2, y: 1, w: 8, h: 5 }],
          },
        ],
      };

      const res = await PUT(
        makeRequest({ layoutJson: next }),
        makeParams("d1"),
      );

      expect(res.status).toBe(200);
      expect(mockDb.select).toHaveBeenCalledTimes(2);
    });

    it("lets that editor change another widget's query while the owner can use the connection", async () => {
      editorSavesOver(layoutOf(table, form()));
      const next = layoutOf(
        { ...table, query: "MATCH (t:Tag) RETURN t.tag" },
        form(),
      );

      const res = await PUT(
        makeRequest({ layoutJson: next }),
        makeParams("d1"),
      );

      expect(res.status).toBe(200);
      expect(mockDb.select).toHaveBeenCalledTimes(5);
    });

    it("lets an editor share add a form on a connection shared with the tenant", async () => {
      mockRequireSession.mockResolvedValue({ ...SESSION, userId: "user-2" });
      const saverAccess = makeSelectChain([]);
      mockDb.select
        .mockReturnValueOnce(
          makeSelectChain([{ ...OWNER_DASHBOARD, layoutJson: layoutOf() }]),
        )
        .mockReturnValueOnce(makeSelectChain([EDITOR_SHARE]))
        .mockReturnValueOnce(saverAccess);
      mockDb.update.mockReturnValue(makeUpdateChain([OWNER_DASHBOARD]));

      const res = await PUT(
        makeRequest({
          layoutJson: layoutOf(form({ connectionId: "c-shared" })),
        }),
        makeParams("d1"),
      );

      expect(res.status).toBe(200);
      const [expr] = saverAccess.calls.where[0];
      expect(sqlValues(expr)).toEqual(
        expect.arrayContaining(["tenant-1", "c-shared", "user-2", "shared"]),
      );
    });

    it("lets an admin add a form on another user's private connection, with no lookup", async () => {
      mockRequireSession.mockResolvedValue({
        ...SESSION,
        userId: "admin-1",
        role: "admin",
      });
      mockDb.select.mockReturnValueOnce(
        makeSelectChain([{ ...OWNER_DASHBOARD, layoutJson: layoutOf(table) }]),
      );
      mockDb.update.mockReturnValue(makeUpdateChain([OWNER_DASHBOARD]));

      const res = await PUT(
        makeRequest({ layoutJson: layoutOf(table, form()) }),
        makeParams("d1"),
      );

      expect(res.status).toBe(200);
      expect(mockDb.select).toHaveBeenCalledTimes(1);
    });

    it("lets the owner add a form on a connection they can use", async () => {
      mockRequireSession.mockResolvedValue(SESSION);
      const ownerAccess = makeSelectChain([]);
      mockDb.select
        .mockReturnValueOnce(
          makeSelectChain([
            { ...OWNER_DASHBOARD, layoutJson: layoutOf(table) },
          ]),
        )
        .mockReturnValueOnce(ownerAccess);
      mockDb.update.mockReturnValue(makeUpdateChain([OWNER_DASHBOARD]));

      const res = await PUT(
        makeRequest({ layoutJson: layoutOf(table, form()) }),
        makeParams("d1"),
      );

      expect(res.status).toBe(200);
      const [expr] = ownerAccess.calls.where[0];
      expect(sqlValues(expr)).toEqual(
        expect.arrayContaining(["tenant-1", "c-alice", "user-1", "shared"]),
      );
    });
  });

  it("answers a stale save with 409 before checking its connections (#1816)", async () => {
    // user-2, an editor share, opened version 3, where a widget used the
    // owner's private c-alice. The owner has since removed it (version 4).
    mockRequireSession.mockResolvedValue({ ...SESSION, userId: "user-2" });
    const stored = {
      ...OWNER_DASHBOARD,
      version: 4,
      layoutJson: layoutOn("c-owner"),
    };
    mockDb.select
      .mockReturnValueOnce(makeSelectChain([stored]))
      .mockReturnValueOnce(makeSelectChain([EDITOR_SHARE]))
      .mockReturnValueOnce(makeSelectChain([{ id: "c-alice" }]));
    mockDb.update.mockReturnValue(makeUpdateChain([]));

    const res = await PUT(
      makeRequest({ layoutJson: layoutOn("c-alice"), expectedVersion: 3 }),
      makeParams("d1"),
    );

    expect(res.status).toBe(409);
    expect((await res.json()).error.message).toMatch(
      /modified by someone else/i,
    );
    expect(mockDb.update).not.toHaveBeenCalled();
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

  it("returns 409 when another save lands between the read and the update", async () => {
    mockRequireSession.mockResolvedValue(SESSION);
    // Read at version 2, the version the client sent, but another save lands
    // before the update: the lock in the update's WHERE is what catches it.
    mockDb.select.mockReturnValue(
      makeSelectChain([{ ...OWNER_DASHBOARD, version: 2 }]),
    );
    const chain = makeUpdateChain([]);
    mockDb.update.mockReturnValue(chain);

    const res = await PUT(
      makeRequest({
        layoutJson: {
          version: 2,
          pages: [{ id: "p1", title: "P", widgets: [], gridLayout: [] }],
        },
        expectedVersion: 2,
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
