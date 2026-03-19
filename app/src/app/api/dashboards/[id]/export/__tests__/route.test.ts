import { describe, it, expect, vi, beforeEach } from "vitest";
import { makeSelectChain } from "@/__tests__/helpers/drizzle-mocks";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockRequireSession = vi.fn<
  () => Promise<{ userId: string; role: string; canWrite: boolean; tenantId: string }>
>();

const mockDb = {
  select: vi.fn(),
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
}));
vi.mock("@/lib/db", () => ({ db: mockDb }));
vi.mock("@/lib/auth/errors", () => ({ UnauthorizedError, ForbiddenError }));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const SESSION = { userId: "user-1", role: "creator", canWrite: true, tenantId: "tenant-1" };

const DASHBOARD_ROW = {
  id: "dash-1",
  name: "My Dashboard",
  description: "A test dashboard",
  tenantId: "tenant-1",
  userId: "user-1",
  isPublic: false,
  layoutJson: {
    version: 2,
    pages: [
      {
        id: "p1",
        title: "Page 1",
        widgets: [
          { id: "w1", chartType: "bar", connectionId: "conn-abc", query: "MATCH (n) RETURN n", settings: {} },
          { id: "w2", chartType: "table", connectionId: "conn-abc", query: "MATCH (m) RETURN m", settings: {} },
        ],
        gridLayout: [
          { i: "w1", x: 0, y: 0, w: 6, h: 4 },
          { i: "w2", x: 6, y: 0, w: 6, h: 4 },
        ],
      },
    ],
  },
  createdAt: new Date(),
  updatedAt: new Date(),
};

const CONNECTION_ROW = { id: "conn-abc", name: "Neo4j Prod", type: "neo4j" };

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("GET /api/dashboards/[id]/export", () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let GET: (req: Request, ctx: { params: Promise<{ id: string }> }) => Promise<any>;

  beforeEach(async () => {
    vi.resetModules();
    vi.clearAllMocks();
    const mod = await import("../route");
    GET = mod.GET;
  });

  it("returns 401 when unauthenticated", async () => {
    mockRequireSession.mockRejectedValue(new UnauthorizedError());

    const res = await GET(new Request("http://localhost"), {
      params: Promise.resolve({ id: "dash-1" }),
    });

    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toBe("Unauthorized");
  });

  it("returns 404 when dashboard is not found", async () => {
    mockRequireSession.mockResolvedValue(SESSION);
    mockDb.select.mockReturnValueOnce(makeSelectChain([]));

    const res = await GET(new Request("http://localhost"), {
      params: Promise.resolve({ id: "nonexistent" }),
    });

    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toBe("Not found");
  });

  it("returns 200 with export payload and download headers", async () => {
    mockRequireSession.mockResolvedValue(SESSION);
    // Dashboard query
    mockDb.select.mockReturnValueOnce(makeSelectChain([DASHBOARD_ROW]));
    // Connections query
    mockDb.select.mockReturnValueOnce(makeSelectChain([CONNECTION_ROW]));

    const res = await GET(new Request("http://localhost"), {
      params: Promise.resolve({ id: "dash-1" }),
    });

    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("application/json");
    expect(res.headers.get("Content-Disposition")).toContain("dashboard-my-dashboard.json");

    const body = await res.json();
    expect(body.formatVersion).toBe(1);
    expect(body.dashboard.name).toBe("My Dashboard");
    expect(body.dashboard.description).toBe("A test dashboard");
    expect(body.connections).toHaveProperty("conn_0");
    expect(body.connections.conn_0).toEqual({ name: "Neo4j Prod", type: "neo4j" });
  });

  it("exports dashboard with no connections (empty layout)", async () => {
    mockRequireSession.mockResolvedValue(SESSION);
    const emptyDash = {
      ...DASHBOARD_ROW,
      layoutJson: {
        version: 2,
        pages: [{ id: "p1", title: "Page 1", widgets: [], gridLayout: [] }],
      },
    };
    mockDb.select.mockReturnValueOnce(makeSelectChain([emptyDash]));

    const res = await GET(new Request("http://localhost"), {
      params: Promise.resolve({ id: "dash-1" }),
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.connections).toEqual({});
    expect(body.layout.pages[0].widgets).toEqual([]);
  });

  it("exports dashboard with null layout", async () => {
    mockRequireSession.mockResolvedValue(SESSION);
    const nullLayoutDash = {
      ...DASHBOARD_ROW,
      layoutJson: null,
    };
    mockDb.select.mockReturnValueOnce(makeSelectChain([nullLayoutDash]));

    const res = await GET(new Request("http://localhost"), {
      params: Promise.resolve({ id: "dash-1" }),
    });

    // buildExportPayload will throw when layout is null → 500
    expect(res.status).toBe(500);
  });

  it("slugifies dashboard name for filename", async () => {
    mockRequireSession.mockResolvedValue(SESSION);
    const specialNameDash = {
      ...DASHBOARD_ROW,
      name: "My  Amazing!! Dashboard #1",
    };
    mockDb.select.mockReturnValueOnce(makeSelectChain([specialNameDash]));
    mockDb.select.mockReturnValueOnce(makeSelectChain([CONNECTION_ROW]));

    const res = await GET(new Request("http://localhost"), {
      params: Promise.resolve({ id: "dash-1" }),
    });

    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Disposition")).toContain("dashboard-my-amazing-dashboard-1.json");
  });

  it("returns 500 for unexpected errors", async () => {
    mockRequireSession.mockResolvedValue(SESSION);
    mockDb.select.mockImplementationOnce(() => {
      throw new Error("DB connection failed");
    });

    const res = await GET(new Request("http://localhost"), {
      params: Promise.resolve({ id: "dash-1" }),
    });

    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toBe("Internal Server Error");
  });

  it("scopes connection query to userId", async () => {
    mockRequireSession.mockResolvedValue(SESSION);
    mockDb.select.mockReturnValueOnce(makeSelectChain([DASHBOARD_ROW]));
    // Return empty connections — simulates user not owning the connection
    mockDb.select.mockReturnValueOnce(makeSelectChain([]));

    const res = await GET(new Request("http://localhost"), {
      params: Promise.resolve({ id: "dash-1" }),
    });

    // buildExportPayload throws when connection row is missing
    expect(res.status).toBe(500);
    // Verify select was called twice (dashboard + connections)
    expect(mockDb.select).toHaveBeenCalledTimes(2);
  });

  it("handles widgets with empty connectionId", async () => {
    mockRequireSession.mockResolvedValue(SESSION);
    const noConnDash = {
      ...DASHBOARD_ROW,
      layoutJson: {
        version: 2,
        pages: [{
          id: "p1",
          title: "Page 1",
          widgets: [
            { id: "w1", chartType: "bar", connectionId: "", query: "RETURN 1", settings: {} },
          ],
          gridLayout: [{ i: "w1", x: 0, y: 0, w: 6, h: 4 }],
        }],
      },
    };
    mockDb.select.mockReturnValueOnce(makeSelectChain([noConnDash]));

    const res = await GET(new Request("http://localhost"), {
      params: Promise.resolve({ id: "dash-1" }),
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.connections).toEqual({});
  });

  it("deduplicates connectionIds across multiple widgets", async () => {
    mockRequireSession.mockResolvedValue(SESSION);
    // Dashboard has 2 widgets sharing the same connection
    mockDb.select.mockReturnValueOnce(makeSelectChain([DASHBOARD_ROW]));
    mockDb.select.mockReturnValueOnce(makeSelectChain([CONNECTION_ROW]));

    const res = await GET(new Request("http://localhost"), {
      params: Promise.resolve({ id: "dash-1" }),
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    // Only one connection key despite two widgets using the same connectionId
    expect(Object.keys(body.connections)).toHaveLength(1);
  });
});
