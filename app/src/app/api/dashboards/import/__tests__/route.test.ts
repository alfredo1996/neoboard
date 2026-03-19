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
vi.mock("next/server", () => nextResponseMockFactory());
vi.mock("@/lib/auth/errors", () => ({ UnauthorizedError, ForbiddenError }));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const SESSION = { userId: "user-1", role: "creator", canWrite: true, tenantId: "tenant-1" };

const VALID_PAYLOAD = {
  formatVersion: 1,
  exportedAt: "2024-01-01T00:00:00.000Z",
  dashboard: { name: "Imported Dashboard", description: null },
  connections: {
    conn_0: { name: "Neo4j Prod", type: "neo4j" },
  },
  layout: {
    version: 2,
    pages: [
      {
        id: "p1",
        title: "Page 1",
        widgets: [
          { id: "w1", chartType: "bar", connectionId: "conn_0", query: "MATCH (n) RETURN n" },
        ],
        gridLayout: [{ i: "w1", x: 0, y: 0, w: 6, h: 4 }],
      },
    ],
  },
};

const NEODASH_PAYLOAD = {
  title: "NeoDash Dashboard",
  version: "2.4",
  pages: [
    {
      title: "Page 1",
      reports: [
        {
          id: "r1",
          title: "My Table",
          type: "table",
          query: "MATCH (n) RETURN n",
          x: 0,
          y: 0,
          width: 6,
          height: 4,
          settings: {},
          parameters: {},
        },
      ],
    },
  ],
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("POST /api/dashboards/import", () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let POST: (req: Request) => Promise<any>;

  beforeEach(async () => {
    vi.resetModules();
    vi.clearAllMocks();
    const mod = await import("../route");
    POST = mod.POST;
  });

  it("returns 401 when unauthenticated", async () => {
    mockRequireSession.mockRejectedValue(new UnauthorizedError());
    const res = await POST(makeRequest({ payload: VALID_PAYLOAD, connectionMapping: {} }));
    expect(res.status).toBe(401);
  });

  it("returns 403 for reader role", async () => {
    mockRequireSession.mockResolvedValue({ ...SESSION, role: "reader", canWrite: false });
    const res = await POST(makeRequest({ payload: VALID_PAYLOAD, connectionMapping: {} }));
    expect(res.status).toBe(403);
  });

  it("returns 400 for invalid payload (missing formatVersion)", async () => {
    mockRequireSession.mockResolvedValue(SESSION);
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { formatVersion: _fv, ...noVersion } = VALID_PAYLOAD;
    const res = await POST(makeRequest({ payload: noVersion, connectionMapping: {} }));
    expect(res.status).toBe(400);
  });

  it("imports a valid NeoBoard export and returns 201", async () => {
    mockRequireSession.mockResolvedValue(SESSION);
    // Connection ownership check returns 1 allowed connection
    mockDb.select.mockReturnValueOnce(makeSelectChain([{ id: "real-conn-id" }]));
    // No existing dashboard with same name
    mockDb.select.mockReturnValueOnce(makeSelectChain([]));
    const created = {
      id: "new-dash",
      name: "Imported Dashboard",
      userId: "user-1",
      tenantId: "tenant-1",
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    mockDb.insert.mockReturnValue(makeInsertChain([created]));

    const res = await POST(
      makeRequest({ payload: VALID_PAYLOAD, connectionMapping: { conn_0: "real-conn-id" } })
    );
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.data).toMatchObject({ id: "new-dash" });
  });

  it("auto-converts NeoDash format and returns 201", async () => {
    mockRequireSession.mockResolvedValue(SESSION);
    mockDb.select.mockReturnValueOnce(makeSelectChain([]));
    const created = { id: "nd-dash", name: "NeoDash Dashboard", userId: "user-1", tenantId: "tenant-1", createdAt: new Date(), updatedAt: new Date() };
    mockDb.insert.mockReturnValue(makeInsertChain([created]));

    const res = await POST(makeRequest({ payload: NEODASH_PAYLOAD, connectionMapping: {} }));
    expect(res.status).toBe(201);
  });

  it("appends (imported) to name when dashboard with same name already exists", async () => {
    mockRequireSession.mockResolvedValue(SESSION);
    // Connection ownership check returns 1 allowed connection
    mockDb.select.mockReturnValueOnce(makeSelectChain([{ id: "real-conn-id" }]));
    // Existing dashboard found
    mockDb.select.mockReturnValueOnce(makeSelectChain([{ id: "existing" }]));
    const created = {
      id: "new-dash",
      name: "Imported Dashboard (imported)",
      userId: "user-1",
      tenantId: "tenant-1",
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    mockDb.insert.mockReturnValue(makeInsertChain([created]));

    const res = await POST(
      makeRequest({ payload: VALID_PAYLOAD, connectionMapping: { conn_0: "real-conn-id" } })
    );
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.data.name).toContain("(imported)");
  });
});
