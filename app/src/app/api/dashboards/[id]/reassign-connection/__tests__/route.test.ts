import { describe, it, expect, vi, beforeEach } from "vitest";
import { makeSelectChain } from "@/__tests__/helpers/drizzle-mocks";
import { makeParams, makeRequest } from "@/__tests__/helpers/request-helpers";
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
const mockReassignConnectionWidgets = vi.fn();
const mockResolveDashboardAccess = vi.fn();
const mockDb = { select: vi.fn() };

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

const { mockAuditRequest } = vi.hoisted(() => ({ mockAuditRequest: vi.fn() }));

vi.mock("@/lib/auth/session", () => ({ requireSession: mockRequireSession }));
vi.mock("@/lib/db", () => ({ db: mockDb }));
vi.mock("@/lib/audit/audit", () => ({
  auditRequest: mockAuditRequest,
  auditLog: vi.fn(),
}));
vi.mock("@/lib/db/connection-reassign", () => ({
  reassignConnectionWidgets: mockReassignConnectionWidgets,
}));
vi.mock("@/lib/dashboard/access", () => ({
  resolveDashboardAccess: mockResolveDashboardAccess,
}));
vi.mock("next/server", () => nextResponseMockFactory());
vi.mock("@/lib/auth/errors", () => ({ UnauthorizedError, ForbiddenError }));

const SESSION = {
  userId: "user-1",
  role: "creator",
  canWrite: true,
  tenantId: "t1",
};

/** An editor-level grant on dashboard "d1". */
const EDITOR_ACCESS = {
  dashboard: { id: "d1", name: "Sales" },
  role: "editor",
};

const PG = { id: "c2", type: "postgresql" };

describe("POST /api/dashboards/[id]/reassign-connection", () => {
  let POST: (
    req: Request,
    ctx: { params: Promise<{ id: string }> },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ) => Promise<any>;

  beforeEach(async () => {
    vi.resetModules();
    vi.clearAllMocks();
    mockRequireSession.mockResolvedValue(SESSION);
    mockResolveDashboardAccess.mockResolvedValue(EDITOR_ACCESS);
    mockReassignConnectionWidgets.mockResolvedValue({
      dashboardsUpdated: 1,
      widgetsReassigned: 4,
    });
    const mod = await import("../route");
    POST = mod.POST;
  });

  // ── Authentication / permission ──────────────────────────────────────

  it("returns 401 when unauthenticated", async () => {
    mockRequireSession.mockRejectedValue(new UnauthorizedError());
    const res = await POST(
      makeRequest({ targetConnectionId: "c2" }),
      makeParams("d1"),
    );
    expect(res.status).toBe(401);
  });

  it("returns 403 when the session cannot write", async () => {
    mockRequireSession.mockResolvedValue({ ...SESSION, canWrite: false });
    const res = await POST(
      makeRequest({ targetConnectionId: "c2" }),
      makeParams("d1"),
    );
    expect(res.status).toBe(403);
    expect(mockReassignConnectionWidgets).not.toHaveBeenCalled();
  });

  it("returns 400 when targetConnectionId is missing", async () => {
    const res = await POST(makeRequest({}), makeParams("d1"));
    expect(res.status).toBe(400);
    expect(mockReassignConnectionWidgets).not.toHaveBeenCalled();
  });

  // An empty target would mass-UNASSIGN every widget on the dashboard.
  it("returns 400 when targetConnectionId is the empty string", async () => {
    const res = await POST(
      makeRequest({ fromConnectionId: "c1", targetConnectionId: "" }),
      makeParams("d1"),
    );
    expect(res.status).toBe(400);
    expect(mockReassignConnectionWidgets).not.toHaveBeenCalled();
  });

  // ── Dashboard authorization ──────────────────────────────────────────

  it("returns 404 for a dashboard in another tenant", async () => {
    mockResolveDashboardAccess.mockResolvedValue(null);
    const res = await POST(
      makeRequest({ targetConnectionId: "c2" }),
      makeParams("d1"),
    );
    expect(res.status).toBe(404);
    expect(mockReassignConnectionWidgets).not.toHaveBeenCalled();
  });

  it("returns 404 for a viewer share — editor is required", async () => {
    // resolveDashboardAccess({ required: "editor" }) returns null for a viewer.
    mockResolveDashboardAccess.mockResolvedValue(null);
    const res = await POST(
      makeRequest({ targetConnectionId: "c2" }),
      makeParams("d1"),
    );
    expect(res.status).toBe(404);
    expect(mockResolveDashboardAccess).toHaveBeenCalledWith(
      expect.objectContaining({ required: "editor" }),
    );
  });

  it("returns 400 when source and target are the same connection", async () => {
    const res = await POST(
      makeRequest({ fromConnectionId: "c2", targetConnectionId: "c2" }),
      makeParams("d1"),
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error.message).toMatch(/different/i);
  });

  // ── Target connection guards ─────────────────────────────────────────

  it("returns 404 when the target connection does not exist", async () => {
    mockDb.select.mockReturnValueOnce(makeSelectChain([]));
    const res = await POST(
      makeRequest({ fromConnectionId: "c1", targetConnectionId: "c2" }),
      makeParams("d1"),
    );
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error.message).toMatch(/target/i);
  });

  // Mirrors what api/query enforces at execution time: in-tenant AND
  // (owner OR visibility='shared' OR admin). "Exists in tenant" is too weak —
  // it would let a user pick someone else's private connection.
  it("returns 404 for a private connection the caller cannot query", async () => {
    mockDb.select.mockReturnValueOnce(makeSelectChain([]));
    const res = await POST(
      makeRequest({ fromConnectionId: "c1", targetConnectionId: "other" }),
      makeParams("d1"),
    );
    expect(res.status).toBe(404);
    expect(mockReassignConnectionWidgets).not.toHaveBeenCalled();
  });

  // ── Connector type check ─────────────────────────────────────────────

  it("returns 400 on a type mismatch for a real source", async () => {
    mockDb.select
      .mockReturnValueOnce(makeSelectChain([{ id: "c2", type: "neo4j" }]))
      .mockReturnValueOnce(makeSelectChain([{ id: "c1", type: "postgresql" }]));
    const res = await POST(
      makeRequest({ fromConnectionId: "c1", targetConnectionId: "c2" }),
      makeParams("d1"),
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error.message).toMatch(/neo4j/);
    expect(body.error.message).toMatch(/postgresql/);
    expect(mockReassignConnectionWidgets).not.toHaveBeenCalled();
  });

  // After an import that skipped a connection the original connector type is
  // unrecoverable, so there is nothing to compare against (#1377).
  it("skips the type check entirely when the source is empty", async () => {
    mockDb.select.mockReturnValueOnce(makeSelectChain([PG]));

    const res = await POST(
      makeRequest({ targetConnectionId: "c2" }),
      makeParams("d1"),
    );

    expect(res.status).toBe(200);
    // Only the target lookup — no source lookup at all.
    expect(mockDb.select).toHaveBeenCalledTimes(1);
    expect(mockReassignConnectionWidgets).toHaveBeenCalledWith(
      expect.objectContaining({ fromConnectionId: "", dashboardId: "d1" }),
    );
  });

  // ── Success ──────────────────────────────────────────────────────────

  it("scopes the reassign to this dashboard and returns the counts", async () => {
    mockDb.select
      .mockReturnValueOnce(makeSelectChain([PG]))
      .mockReturnValueOnce(makeSelectChain([{ id: "c1", type: "postgresql" }]));

    const res = await POST(
      makeRequest({ fromConnectionId: "c1", targetConnectionId: "c2" }),
      makeParams("d1"),
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data).toEqual({ dashboardsUpdated: 1, widgetsReassigned: 4 });
    expect(mockReassignConnectionWidgets).toHaveBeenCalledWith({
      fromConnectionId: "c1",
      toConnectionId: "c2",
      dashboardId: "d1",
      userId: "user-1",
      isAdmin: false,
      tenantId: "t1",
    });
  });

  it("audits against the dashboard, not the connection", async () => {
    mockDb.select
      .mockReturnValueOnce(makeSelectChain([PG]))
      .mockReturnValueOnce(makeSelectChain([{ id: "c1", type: "postgresql" }]));

    await POST(
      makeRequest({ fromConnectionId: "c1", targetConnectionId: "c2" }),
      makeParams("d1"),
    );

    expect(mockAuditRequest).toHaveBeenCalledTimes(1);
    const [, entry] = mockAuditRequest.mock.calls[0];
    expect(entry).toMatchObject({
      action: "connection.reassign",
      resourceType: "dashboard",
      resourceId: "d1",
      tenantId: "t1",
      userId: "user-1",
      details: {
        fromConnectionId: "c1",
        targetConnectionId: "c2",
        dashboardsUpdated: 1,
        widgetsReassigned: 4,
      },
    });
  });

  it("writes no audit entry when a guard rejects", async () => {
    mockDb.select
      .mockReturnValueOnce(makeSelectChain([{ id: "c2", type: "neo4j" }]))
      .mockReturnValueOnce(makeSelectChain([{ id: "c1", type: "postgresql" }]));

    const res = await POST(
      makeRequest({ fromConnectionId: "c1", targetConnectionId: "c2" }),
      makeParams("d1"),
    );

    expect(res.status).toBe(400);
    expect(mockAuditRequest).not.toHaveBeenCalled();
  });

  it("returns 500 when the reassign throws", async () => {
    mockDb.select.mockReturnValueOnce(makeSelectChain([PG]));
    mockReassignConnectionWidgets.mockRejectedValue(new Error("DB down"));

    const res = await POST(
      makeRequest({ targetConnectionId: "c2" }),
      makeParams("d1"),
    );
    expect(res.status).toBe(500);
  });

  // ── Multi-tenancy ────────────────────────────────────────────────────

  it("takes tenantId from the session and ignores the request body", async () => {
    mockDb.select.mockReturnValueOnce(makeSelectChain([PG]));

    await POST(
      makeRequest({ targetConnectionId: "c2", tenantId: "attacker-tenant" }),
      makeParams("d1"),
    );

    expect(mockReassignConnectionWidgets).toHaveBeenCalledWith(
      expect.objectContaining({ tenantId: "t1" }),
    );
    expect(mockResolveDashboardAccess).toHaveBeenCalledWith(
      expect.objectContaining({ tenantId: "t1" }),
    );
  });

  it("passes isAdmin through for an admin session", async () => {
    mockRequireSession.mockResolvedValue({ ...SESSION, role: "admin" });
    mockDb.select.mockReturnValueOnce(makeSelectChain([PG]));

    await POST(makeRequest({ targetConnectionId: "c2" }), makeParams("d1"));

    expect(mockReassignConnectionWidgets).toHaveBeenCalledWith(
      expect.objectContaining({ isAdmin: true }),
    );
  });
});
