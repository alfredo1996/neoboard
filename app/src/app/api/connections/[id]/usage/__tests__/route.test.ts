import { describe, it, expect, vi, beforeEach } from "vitest";
import { makeSelectChain } from "@/__tests__/helpers/drizzle-mocks";
import { makeParams } from "@/__tests__/helpers/request-helpers";
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
const mockGetConnectionUsage = vi.fn();

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

vi.mock("@/lib/auth/session", () => ({ requireSession: mockRequireSession }));
vi.mock("@/lib/db", () => ({ db: mockDb }));
vi.mock("@/lib/db/connection-usage", () => ({
  getConnectionUsage: mockGetConnectionUsage,
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

// ---------------------------------------------------------------------------
// GET /api/connections/[id]/usage
// ---------------------------------------------------------------------------

describe("GET /api/connections/[id]/usage", () => {
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
    const res = await GET({} as Request, makeParams("c1"));
    expect(res.status).toBe(401);
  });

  it("returns 404 when connection not found or not owned", async () => {
    mockRequireSession.mockResolvedValue(SESSION);
    mockDb.select.mockReturnValue(makeSelectChain([]));

    const res = await GET({} as Request, makeParams("c1"));
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error.message).toBe("Connection not found");
  });

  it("returns usage breakdown for the owner", async () => {
    mockRequireSession.mockResolvedValue(SESSION);
    mockDb.select.mockReturnValue(makeSelectChain([{ id: "c1" }]));
    mockGetConnectionUsage.mockResolvedValue({
      widgetCount: 3,
      dashboards: [
        { id: "d1", name: "Sales", widgetCount: 2 },
        { id: "d2", name: "Inventory", widgetCount: 1 },
      ],
    });

    const res = await GET({} as Request, makeParams("c1"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.widgetCount).toBe(3);
    expect(body.data.dashboards).toHaveLength(2);

    // Helper was called with the creator userId + isAdmin=false
    expect(mockGetConnectionUsage).toHaveBeenCalledWith(
      "c1",
      "user-1",
      false,
      "t1",
    );
  });

  it("admin can query usage for any connection in the same tenant", async () => {
    mockRequireSession.mockResolvedValue(ADMIN_SESSION);
    mockDb.select.mockReturnValue(makeSelectChain([{ id: "c1" }]));
    mockGetConnectionUsage.mockResolvedValue({
      widgetCount: 5,
      dashboards: [{ id: "d1", name: "Team dash", widgetCount: 5 }],
    });

    const res = await GET({} as Request, makeParams("c1"));
    expect(res.status).toBe(200);
    // Helper was called with isAdmin=true so the query returns the
    // full tenant-wide view, not just the admin's owned dashboards.
    expect(mockGetConnectionUsage).toHaveBeenCalledWith(
      "c1",
      "admin-1",
      true,
      "t1",
    );
  });

  it("returns empty usage when the connection has no widgets", async () => {
    mockRequireSession.mockResolvedValue(SESSION);
    mockDb.select.mockReturnValue(makeSelectChain([{ id: "c1" }]));
    mockGetConnectionUsage.mockResolvedValue({
      widgetCount: 0,
      dashboards: [],
    });

    const res = await GET({} as Request, makeParams("c1"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.widgetCount).toBe(0);
    expect(body.data.dashboards).toEqual([]);
  });
});
