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

// vi.hoisted: vi.mock factories are hoisted above top-level consts, so the
// mock must be created in the hoisted scope to stay safe if a future refactor
// switches this file to a static import of the route.
const { mockAuditRequest } = vi.hoisted(() => ({ mockAuditRequest: vi.fn() }));

vi.mock("@/lib/auth/session", () => ({ requireSession: mockRequireSession }));
vi.mock("@/lib/db", () => ({ db: mockDb }));
// Audit is mocked so route assertions aren't polluted by its own db.insert.
vi.mock("@/lib/audit/audit", () => ({
  auditRequest: mockAuditRequest,
  auditLog: vi.fn(),
}));
vi.mock("@/lib/db/connection-reassign", () => ({
  reassignConnectionWidgets: mockReassignConnectionWidgets,
}));
vi.mock("next/server", () => nextResponseMockFactory());
vi.mock("@/lib/auth/errors", () => ({ UnauthorizedError, ForbiddenError }));

const SESSION = {
  userId: "user-1",
  role: "creator",
  canWrite: true,
  tenantId: "t1",
};
const ADMIN_SESSION = {
  userId: "admin-1",
  role: "admin",
  canWrite: true,
  tenantId: "t1",
};

describe("POST /api/connections/[id]/reassign", () => {
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
      makeRequest({ targetConnectionId: "t" }),
      makeParams("c1"),
    );
    expect(res.status).toBe(401);
  });

  it("returns 400 when body is missing targetConnectionId", async () => {
    mockRequireSession.mockResolvedValue(SESSION);
    const res = await POST(makeRequest({}), makeParams("c1"));
    expect(res.status).toBe(400);
  });

  it("returns 400 when source and target are the same connection", async () => {
    mockRequireSession.mockResolvedValue(SESSION);
    const res = await POST(
      makeRequest({ targetConnectionId: "c1" }),
      makeParams("c1"),
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error.message).toMatch(/different/i);
  });

  it("returns 404 when source connection is not owned", async () => {
    mockRequireSession.mockResolvedValue(SESSION);
    mockDb.select.mockReturnValueOnce(makeSelectChain([]));
    const res = await POST(
      makeRequest({ targetConnectionId: "c2" }),
      makeParams("c1"),
    );
    expect(res.status).toBe(404);
  });

  it("returns 404 when target connection does not exist", async () => {
    mockRequireSession.mockResolvedValue(SESSION);
    mockDb.select
      .mockReturnValueOnce(makeSelectChain([{ id: "c1", type: "postgresql" }]))
      .mockReturnValueOnce(makeSelectChain([]));
    const res = await POST(
      makeRequest({ targetConnectionId: "c2" }),
      makeParams("c1"),
    );
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error.message).toMatch(/target/i);
  });

  it("returns 400 when target type differs from source", async () => {
    mockRequireSession.mockResolvedValue(SESSION);
    mockDb.select
      .mockReturnValueOnce(makeSelectChain([{ id: "c1", type: "postgresql" }]))
      .mockReturnValueOnce(makeSelectChain([{ id: "c2", type: "neo4j" }]));
    const res = await POST(
      makeRequest({ targetConnectionId: "c2" }),
      makeParams("c1"),
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error.message).toMatch(/neo4j/);
    expect(body.error.message).toMatch(/postgresql/);
  });

  it("succeeds and returns reassign counts for a non-admin owner", async () => {
    mockRequireSession.mockResolvedValue(SESSION);
    mockDb.select
      .mockReturnValueOnce(makeSelectChain([{ id: "c1", type: "postgresql" }]))
      .mockReturnValueOnce(makeSelectChain([{ id: "c2", type: "postgresql" }]));
    mockReassignConnectionWidgets.mockResolvedValue({
      dashboardsUpdated: 3,
      widgetsReassigned: 7,
    });

    const res = await POST(
      makeRequest({ targetConnectionId: "c2" }),
      makeParams("c1"),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data).toEqual({ dashboardsUpdated: 3, widgetsReassigned: 7 });
    expect(mockReassignConnectionWidgets).toHaveBeenCalledWith({
      fromConnectionId: "c1",
      toConnectionId: "c2",
      userId: "user-1",
      isAdmin: false,
      tenantId: "t1",
    });
  });

  it("records a connection.reassign audit entry (#1234)", async () => {
    mockRequireSession.mockResolvedValue(SESSION);
    mockDb.select
      .mockReturnValueOnce(makeSelectChain([{ id: "c1", type: "postgresql" }]))
      .mockReturnValueOnce(makeSelectChain([{ id: "c2", type: "postgresql" }]));
    mockReassignConnectionWidgets.mockResolvedValue({
      dashboardsUpdated: 3,
      widgetsReassigned: 7,
    });

    await POST(makeRequest({ targetConnectionId: "c2" }), makeParams("c1"));

    expect(mockAuditRequest).toHaveBeenCalledTimes(1);
    const [, entry] = mockAuditRequest.mock.calls[0];
    expect(entry).toMatchObject({
      action: "connection.reassign",
      resourceType: "connection",
      resourceId: "c1",
      tenantId: SESSION.tenantId,
      userId: SESSION.userId,
      details: {
        targetConnectionId: "c2",
        dashboardsUpdated: 3,
        widgetsReassigned: 7,
      },
    });
  });

  it("writes no audit entry when the type check rejects the reassign (#1234)", async () => {
    mockRequireSession.mockResolvedValue(SESSION);
    mockDb.select
      .mockReturnValueOnce(makeSelectChain([{ id: "c1", type: "postgresql" }]))
      .mockReturnValueOnce(makeSelectChain([{ id: "c2", type: "neo4j" }]));

    const res = await POST(
      makeRequest({ targetConnectionId: "c2" }),
      makeParams("c1"),
    );

    expect(res.status).toBe(400);
    expect(mockAuditRequest).not.toHaveBeenCalled();
  });

  it("allows admins to reassign any connection in their tenant", async () => {
    mockRequireSession.mockResolvedValue(ADMIN_SESSION);
    mockDb.select
      .mockReturnValueOnce(makeSelectChain([{ id: "c1", type: "neo4j" }]))
      .mockReturnValueOnce(makeSelectChain([{ id: "c2", type: "neo4j" }]));
    mockReassignConnectionWidgets.mockResolvedValue({
      dashboardsUpdated: 0,
      widgetsReassigned: 0,
    });

    const res = await POST(
      makeRequest({ targetConnectionId: "c2" }),
      makeParams("c1"),
    );
    expect(res.status).toBe(200);
    expect(mockReassignConnectionWidgets).toHaveBeenCalledWith({
      fromConnectionId: "c1",
      toConnectionId: "c2",
      userId: "admin-1",
      isAdmin: true,
      tenantId: "t1",
    });
  });

  it("returns zero counts when nothing uses the source connection", async () => {
    mockRequireSession.mockResolvedValue(SESSION);
    mockDb.select
      .mockReturnValueOnce(makeSelectChain([{ id: "c1", type: "postgresql" }]))
      .mockReturnValueOnce(makeSelectChain([{ id: "c2", type: "postgresql" }]));
    mockReassignConnectionWidgets.mockResolvedValue({
      dashboardsUpdated: 0,
      widgetsReassigned: 0,
    });

    const res = await POST(
      makeRequest({ targetConnectionId: "c2" }),
      makeParams("c1"),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data).toEqual({ dashboardsUpdated: 0, widgetsReassigned: 0 });
  });

  it("returns 500 when the reassign function throws", async () => {
    mockRequireSession.mockResolvedValue(SESSION);
    mockDb.select
      .mockReturnValueOnce(makeSelectChain([{ id: "c1", type: "postgresql" }]))
      .mockReturnValueOnce(makeSelectChain([{ id: "c2", type: "postgresql" }]));
    mockReassignConnectionWidgets.mockRejectedValue(new Error("DB down"));

    const res = await POST(
      makeRequest({ targetConnectionId: "c2" }),
      makeParams("c1"),
    );
    expect(res.status).toBe(500);
  });
});
