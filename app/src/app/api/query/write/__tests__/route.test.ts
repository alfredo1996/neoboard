import { describe, it, expect, vi, beforeEach } from "vitest";
import { makeRequest } from "@/__tests__/helpers/request-helpers";
import { nextResponseMockFactory } from "@/__tests__/helpers/next-mocks";

// ---------------------------------------------------------------------------
// Mocks — must be declared before importing the route so Vitest hoists them.
// ---------------------------------------------------------------------------

const mockRequireSession = vi.fn<
  () => Promise<{
    userId: string;
    tenantId: string;
    role: string;
    canWrite: boolean;
  }>
>();
const mockDb = {
  select: vi.fn(),
  insert: vi.fn(),
  update: vi.fn(),
  delete: vi.fn(),
};
const mockDecryptJson = vi.fn();
const mockExecuteQuery = vi.fn();

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
vi.mock("@/lib/crypto/crypto", () => ({
  decryptJson: mockDecryptJson,
  encryptJson: vi.fn(),
}));
vi.mock("@/lib/query/query-executor", () => ({
  executeQuery: mockExecuteQuery,
}));

// Minimal Next.js server shim
vi.mock("next/server", () => nextResponseMockFactory());
vi.mock("@/lib/auth/errors", () => ({ UnauthorizedError, ForbiddenError }));

/** Chainable drizzle query builder stub that resolves to `rows`. */
function drizzleSelectChain(rows: unknown[]) {
  const chain = {
    from: () => chain,
    where: () => chain,
    limit: () => Promise.resolve(rows),
  };
  return chain;
}

const writerSession = {
  userId: "user-1",
  tenantId: "tenant-a",
  role: "creator",
  canWrite: true,
};
const readerSession = {
  userId: "user-2",
  tenantId: "tenant-a",
  role: "reader",
  canWrite: false,
};

const fakeConnection = {
  id: "c1",
  type: "neo4j",
  configEncrypted: "enc",
  userId: "user-1",
};

const fakeDashboard = {
  id: "d1",
  tenantId: "tenant-a",
  layoutJson: {
    version: 2,
    pages: [
      {
        id: "p1",
        title: "Page 1",
        widgets: [
          {
            id: "w1",
            chartType: "table",
            connectionId: "c1",
            query: "CREATE (n:Test)",
            allowWrites: true,
          },
        ],
        gridLayout: [],
      },
    ],
  },
};

/** Sets up mocks for both connection + dashboard lookups. */
function mockConnectionAndDashboard() {
  mockDb.select
    .mockReturnValueOnce(drizzleSelectChain([fakeConnection]))
    .mockReturnValueOnce(drizzleSelectChain([fakeDashboard]));
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("POST /api/query/write", () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let POST: (req: Request) => Promise<any>;

  beforeEach(async () => {
    vi.resetModules();
    vi.clearAllMocks();

    const mod = await import("../route");
    POST = mod.POST;
  });

  it("returns 403 when canWrite is false (reader role)", async () => {
    mockRequireSession.mockResolvedValue(readerSession);
    const res = await POST(
      makeRequest({ connectionId: "c1", query: "CREATE (n:Test)" }),
    );
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error.message).toMatch(/write permission/i);
  });

  it("returns 401 when session retrieval fails with UnauthorizedError", async () => {
    mockRequireSession.mockRejectedValue(new UnauthorizedError());
    const res = await POST(
      makeRequest({ connectionId: "c1", query: "CREATE (n:Test)" }),
    );
    // handleRouteError maps UnauthorizedError → 401
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error.code).toBe("UNAUTHORIZED");
  });

  it("returns 400 for missing connectionId", async () => {
    mockRequireSession.mockResolvedValue(writerSession);
    const res = await POST(makeRequest({ query: "CREATE (n:Test)" }));
    expect(res.status).toBe(400);
  });

  it("returns 400 for missing query", async () => {
    mockRequireSession.mockResolvedValue(writerSession);
    const res = await POST(makeRequest({ connectionId: "c1" }));
    expect(res.status).toBe(400);
  });

  it("returns 404 when connection not found", async () => {
    mockRequireSession.mockResolvedValue(writerSession);
    mockDb.select.mockReturnValue(drizzleSelectChain([]));
    const res = await POST(
      makeRequest({
        connectionId: "c1",
        query: "CREATE (n:Test)",
        widgetId: "w1",
        dashboardId: "d1",
      }),
    );
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error.message).toMatch(/not found/i);
  });

  it("returns 200 on success and calls executeQuery with accessMode WRITE", async () => {
    mockRequireSession.mockResolvedValue(writerSession);
    mockConnectionAndDashboard();
    mockDecryptJson.mockReturnValue({
      uri: "bolt://localhost",
      username: "neo4j",
      password: "pass",
    });
    mockExecuteQuery.mockResolvedValue({ data: { nodesCreated: 1 } });

    const res = await POST(
      makeRequest({
        connectionId: "c1",
        query: "CREATE (n:Test)",
        widgetId: "w1",
        dashboardId: "d1",
      }),
    );
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.data).toEqual({ nodesCreated: 1 });
    expect(typeof body.meta.serverDurationMs).toBe("number");

    // Verify executeQuery was called with WRITE access mode.
    // The route wraps executeQuery in the query middleware pipeline,
    // which normalizes missing params to {} so middleware sees a
    // consistent shape.
    expect(mockExecuteQuery).toHaveBeenCalledWith(
      "neo4j",
      { uri: "bolt://localhost", username: "neo4j", password: "pass" },
      { query: "CREATE (n:Test)", params: {} },
      { accessMode: "WRITE" },
    );
  });

  it("passes params correctly to executeQuery", async () => {
    mockRequireSession.mockResolvedValue(writerSession);
    mockConnectionAndDashboard();
    mockDecryptJson.mockReturnValue({
      uri: "bolt://localhost",
      username: "neo4j",
      password: "pass",
    });
    mockExecuteQuery.mockResolvedValue({ data: { nodesCreated: 1 } });

    const params = { param_name: "Alice", param_age: 30 };
    const res = await POST(
      makeRequest({
        connectionId: "c1",
        query: "CREATE (n:Person {name: $param_name, age: $param_age})",
        params,
        widgetId: "w1",
        dashboardId: "d1",
      }),
    );
    expect(res.status).toBe(200);
    expect(mockExecuteQuery).toHaveBeenCalledWith(
      "neo4j",
      expect.any(Object),
      {
        query: "CREATE (n:Person {name: $param_name, age: $param_age})",
        params,
      },
      { accessMode: "WRITE" },
    );
  });

  it("returns 500 with sanitized message when executeQuery throws (no driver leak)", async () => {
    mockRequireSession.mockResolvedValue(writerSession);
    mockConnectionAndDashboard();
    mockDecryptJson.mockReturnValue({
      uri: "bolt://localhost",
      username: "neo4j",
      password: "pass",
    });
    // Driver errors echo user-supplied SQL — must never bleed into the
    // response body (security/PII consideration).
    mockExecuteQuery.mockRejectedValue(
      new Error('syntax error at or near "THIS"'),
    );

    const res = await POST(
      makeRequest({
        connectionId: "c1",
        query: "THIS IS NOT VALID SQL",
        widgetId: "w1",
        dashboardId: "d1",
      }),
    );
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error.message).toBe("Write query execution failed");
    expect(body.error.message).not.toMatch(/syntax error/i);
  });

  it("returns 404 when connection belongs to another user", async () => {
    mockRequireSession.mockResolvedValue(writerSession);
    mockDb.select.mockReturnValue(drizzleSelectChain([]));
    const res = await POST(
      makeRequest({
        connectionId: "c1",
        query: "CREATE (n:Test)",
        widgetId: "w1",
        dashboardId: "d1",
      }),
    );
    expect(res.status).toBe(404);
  });

  it("returns 404 when connection belongs to a different tenant", async () => {
    mockRequireSession.mockResolvedValue({
      ...writerSession,
      tenantId: "tenant-other",
    });
    mockDb.select.mockReturnValue(drizzleSelectChain([]));
    const res = await POST(
      makeRequest({
        connectionId: "c1",
        query: "CREATE (n:Test)",
        widgetId: "w1",
        dashboardId: "d1",
      }),
    );
    expect(res.status).toBe(404);
  });

  it("returns 403 when widget allowWrites is false", async () => {
    mockRequireSession.mockResolvedValue(writerSession);
    // First select: connection found. Second select: dashboard found.
    mockDb.select
      .mockReturnValueOnce(drizzleSelectChain([fakeConnection]))
      .mockReturnValueOnce(
        drizzleSelectChain([
          {
            id: "d1",
            tenantId: "tenant-a",
            layoutJson: {
              version: 2,
              pages: [
                {
                  id: "p1",
                  title: "Page 1",
                  widgets: [
                    {
                      id: "w1",
                      chartType: "table",
                      connectionId: "c1",
                      query: "CREATE (n:Test)",
                      allowWrites: false,
                    },
                  ],
                  gridLayout: [],
                },
              ],
            },
          },
        ]),
      );

    const res = await POST(
      makeRequest({
        connectionId: "c1",
        query: "CREATE (n:Test)",
        widgetId: "w1",
        dashboardId: "d1",
      }),
    );
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error.message).toMatch(/write mode.*not enabled/i);
  });

  it("succeeds without widgetId (legacy form-widget path)", async () => {
    mockRequireSession.mockResolvedValue(writerSession);
    mockDb.select.mockReturnValue(drizzleSelectChain([fakeConnection]));
    mockDecryptJson.mockReturnValue({
      uri: "bolt://localhost",
      username: "neo4j",
      password: "pass",
    });
    mockExecuteQuery.mockResolvedValue({ data: { ok: 1 } });

    const res = await POST(
      makeRequest({
        connectionId: "c1",
        query: "CREATE (n:Test)",
        // No widgetId or dashboardId — form widget legacy path
      }),
    );
    expect(res.status).toBe(200);
  });

  it("returns 200 when widget has allowWrites=true", async () => {
    mockRequireSession.mockResolvedValue(writerSession);
    mockDb.select
      .mockReturnValueOnce(drizzleSelectChain([fakeConnection]))
      .mockReturnValueOnce(
        drizzleSelectChain([
          {
            id: "d1",
            tenantId: "tenant-a",
            layoutJson: {
              version: 2,
              pages: [
                {
                  id: "p1",
                  title: "Page 1",
                  widgets: [
                    {
                      id: "w1",
                      chartType: "table",
                      connectionId: "c1",
                      query: "CREATE (n:Test)",
                      allowWrites: true,
                    },
                  ],
                  gridLayout: [],
                },
              ],
            },
          },
        ]),
      );
    mockDecryptJson.mockReturnValue({
      uri: "bolt://localhost",
      username: "neo4j",
      password: "pass",
    });
    mockExecuteQuery.mockResolvedValue({ data: { nodesCreated: 1 } });

    const res = await POST(
      makeRequest({
        connectionId: "c1",
        query: "CREATE (n:Test)",
        widgetId: "w1",
        dashboardId: "d1",
      }),
    );
    expect(res.status).toBe(200);
  });

  it("returns 404 when dashboard not found", async () => {
    mockRequireSession.mockResolvedValue(writerSession);
    mockDb.select
      .mockReturnValueOnce(drizzleSelectChain([fakeConnection]))
      .mockReturnValueOnce(drizzleSelectChain([])); // dashboard not found

    const res = await POST(
      makeRequest({
        connectionId: "c1",
        query: "CREATE (n:Test)",
        widgetId: "w1",
        dashboardId: "d1",
      }),
    );
    expect(res.status).toBe(404);
  });

  it("applies per-card database override when connection allows it", async () => {
    mockRequireSession.mockResolvedValue(writerSession);
    mockDb.select
      .mockReturnValueOnce(
        drizzleSelectChain([{ ...fakeConnection, allowPerCardDb: true }]),
      )
      .mockReturnValueOnce(
        drizzleSelectChain([
          {
            id: "d1",
            tenantId: "tenant-a",
            layoutJson: {
              version: 2,
              pages: [
                {
                  id: "p1",
                  title: "Page 1",
                  widgets: [
                    {
                      id: "w1",
                      chartType: "table",
                      connectionId: "c1",
                      query: "CREATE (n:Test)",
                      allowWrites: true,
                      database: "analytics",
                    },
                  ],
                  gridLayout: [],
                },
              ],
            },
          },
        ]),
      );
    mockDecryptJson.mockReturnValue({
      uri: "bolt://localhost",
      username: "neo4j",
      password: "pass",
    });
    mockExecuteQuery.mockResolvedValue({ data: { nodesCreated: 1 } });

    const res = await POST(
      makeRequest({
        connectionId: "c1",
        query: "CREATE (n:Test)",
        widgetId: "w1",
        dashboardId: "d1",
      }),
    );
    expect(res.status).toBe(200);
    expect(mockExecuteQuery).toHaveBeenCalledWith(
      "neo4j",
      expect.objectContaining({ database: "analytics" }),
      expect.any(Object),
      { accessMode: "WRITE" },
    );
  });

  it("ignores per-card database override when connection disallows it", async () => {
    mockRequireSession.mockResolvedValue(writerSession);
    mockDb.select
      .mockReturnValueOnce(
        drizzleSelectChain([{ ...fakeConnection, allowPerCardDb: false }]),
      )
      .mockReturnValueOnce(
        drizzleSelectChain([
          {
            id: "d1",
            tenantId: "tenant-a",
            layoutJson: {
              version: 2,
              pages: [
                {
                  id: "p1",
                  title: "Page 1",
                  widgets: [
                    {
                      id: "w1",
                      chartType: "table",
                      connectionId: "c1",
                      query: "CREATE (n:Test)",
                      allowWrites: true,
                      database: "analytics",
                    },
                  ],
                  gridLayout: [],
                },
              ],
            },
          },
        ]),
      );
    mockDecryptJson.mockReturnValue({
      uri: "bolt://localhost",
      username: "neo4j",
      password: "pass",
      database: "primary",
    });
    mockExecuteQuery.mockResolvedValue({ data: { nodesCreated: 1 } });

    const res = await POST(
      makeRequest({
        connectionId: "c1",
        query: "CREATE (n:Test)",
        widgetId: "w1",
        dashboardId: "d1",
      }),
    );
    expect(res.status).toBe(200);
    // Should use original credentials with connection-level database preserved
    expect(mockExecuteQuery).toHaveBeenCalledWith(
      "neo4j",
      {
        uri: "bolt://localhost",
        username: "neo4j",
        password: "pass",
        database: "primary",
      },
      expect.any(Object),
      { accessMode: "WRITE" },
    );
  });

  it("returns 403 when widget allowWrites is missing (legacy widget)", async () => {
    mockRequireSession.mockResolvedValue(writerSession);
    mockDb.select
      .mockReturnValueOnce(drizzleSelectChain([fakeConnection]))
      .mockReturnValueOnce(
        drizzleSelectChain([
          {
            id: "d1",
            tenantId: "tenant-a",
            layoutJson: {
              version: 2,
              pages: [
                {
                  id: "p1",
                  title: "Page 1",
                  widgets: [
                    {
                      id: "w1",
                      chartType: "table",
                      connectionId: "c1",
                      query: "CREATE (n:Test)",
                      // allowWrites intentionally omitted — legacy widget
                    },
                  ],
                  gridLayout: [],
                },
              ],
            },
          },
        ]),
      );

    const res = await POST(
      makeRequest({
        connectionId: "c1",
        query: "CREATE (n:Test)",
        widgetId: "w1",
        dashboardId: "d1",
      }),
    );
    expect(res.status).toBe(403);
  });

  it("returns 403 when widget connectionId does not match request connectionId", async () => {
    mockRequireSession.mockResolvedValue(writerSession);
    mockDb.select
      .mockReturnValueOnce(drizzleSelectChain([fakeConnection]))
      .mockReturnValueOnce(
        drizzleSelectChain([
          {
            id: "d1",
            tenantId: "tenant-a",
            layoutJson: {
              version: 2,
              pages: [
                {
                  id: "p1",
                  title: "Page 1",
                  widgets: [
                    {
                      id: "w1",
                      chartType: "table",
                      connectionId: "c-other", // different connection
                      query: "CREATE (n:Test)",
                      allowWrites: true,
                    },
                  ],
                  gridLayout: [],
                },
              ],
            },
          },
        ]),
      );

    const res = await POST(
      makeRequest({
        connectionId: "c1",
        query: "CREATE (n:Test)",
        widgetId: "w1",
        dashboardId: "d1",
      }),
    );
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error.message).toMatch(/does not belong/i);
  });

  it("does not apply MAX_ROWS truncation on write results", async () => {
    mockRequireSession.mockResolvedValue(writerSession);
    mockConnectionAndDashboard();
    mockDecryptJson.mockReturnValue({
      uri: "bolt://localhost",
      username: "neo4j",
      password: "pass",
    });
    // Return a large result (write routes should not truncate)
    const bigData = Array.from({ length: 15000 }, (_, i) => ({ n: i }));
    mockExecuteQuery.mockResolvedValue({ data: bigData });

    const res = await POST(
      makeRequest({
        connectionId: "c1",
        query: "CREATE (n:Test)",
        widgetId: "w1",
        dashboardId: "d1",
      }),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data).toHaveLength(15000);
    expect(body.meta).not.toHaveProperty("truncated");
  });
});
