import { describe, it, expect, vi, beforeEach } from "vitest";
import { ConnectorError, ConnectorErrorType } from "@neoboard/connection";
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

/** Records each dashboard access check; the real helper still decides. */
const accessChecks = vi.fn();

vi.mock("@/lib/auth/session", () => ({ requireSession: mockRequireSession }));
vi.mock("@/lib/dashboard/access", async (importOriginal) => {
  const real = await importOriginal<typeof import("@/lib/dashboard/access")>();
  return {
    ...real,
    resolveDashboardAccess: (
      opts: Parameters<typeof real.resolveDashboardAccess>[0],
    ) => {
      accessChecks(opts);
      return real.resolveDashboardAccess(opts);
    },
  };
});
vi.mock("@/lib/db", () => ({ db: mockDb }));
vi.mock("@/lib/crypto/crypto", () => ({
  decryptJson: mockDecryptJson,
  encryptJson: vi.fn(),
}));
vi.mock("@/lib/query/query-executor", () => ({
  executeQuery: mockExecuteQuery,
  toConnectorAccessMode: (m: "read" | "write") =>
    m === "write" ? "WRITE" : "READ",
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
  userId: "user-1",
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
    // clearAllMocks keeps queued return values; no test inherits another's.
    mockDb.select.mockReset();

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

  it("surfaces a specific reason for a NOT NULL violation without leaking row data (#1162)", async () => {
    mockRequireSession.mockResolvedValue(writerSession);
    mockConnectionAndDashboard();
    mockDecryptJson.mockReturnValue({
      uri: "postgresql://localhost",
      username: "neoboard",
      password: "pass",
    });
    const pgError = Object.assign(
      new Error('null value in column "rating" of relation "feedback" ...'),
      {
        code: "23502",
        column: "rating",
        table: "feedback",
        detail: "Failing row contains (12, null, test, jpijpjp, ...).",
      },
    );
    mockExecuteQuery.mockRejectedValue(
      new ConnectorError("query failed", ConnectorErrorType.QUERY, pgError),
    );

    const res = await POST(
      makeRequest({
        connectionId: "c1",
        query:
          "INSERT INTO feedback (category) VALUES ($param_category) RETURNING id",
        widgetId: "w1",
        dashboardId: "d1",
      }),
    );
    // A blank field is the user's error, not the server's (#1409).
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error.message).toBe('The field "rating" is required.');
    // The column lets the form put the error on the field that caused it.
    expect(body.error.details).toEqual({ column: "rating" });
    // No row data, driver message, or SQL leaks through.
    expect(JSON.stringify(body)).not.toMatch(/Failing row|null value|INSERT/i);
  });

  it.each([
    ["23505", 409, "A record with these values already exists."],
    ["23514", 400, "A value failed a validation constraint."],
    ["25006", 403, "This connection is read-only; writes are not permitted."],
    ["22001", 400, "A value is too long."],
    ["22007", 400, "A date or time value is invalid."],
    ["23P01", 400, "A record conflicts with an existing one."],
    [
      "Neo.ClientError.Schema.ConstraintValidationFailed",
      400,
      "A value violates a database constraint.",
    ],
  ])(
    "responds to a recognised driver error %s with %i, not 500 (#1409)",
    async (code, status, message) => {
      mockRequireSession.mockResolvedValue(writerSession);
      mockConnectionAndDashboard();
      mockDecryptJson.mockReturnValue({ uri: "postgresql://localhost" });
      const pgError = Object.assign(new Error("INSERT INTO t ... secret"), {
        code,
      });
      mockExecuteQuery.mockRejectedValue(
        new ConnectorError("query failed", ConnectorErrorType.QUERY, pgError),
      );

      const res = await POST(
        makeRequest({
          connectionId: "c1",
          query: "INSERT INTO t (a) VALUES ($param_a)",
          widgetId: "w1",
          dashboardId: "d1",
        }),
      );
      expect(res.status).toBe(status);
      const body = await res.json();
      expect(body.error.message).toBe(message);
      expect(body.error.details).toBeUndefined();
      expect(JSON.stringify(body)).not.toMatch(/INSERT|secret/);
    },
  );

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
            userId: "user-1",
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
            userId: "user-1",
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
            userId: "user-1",
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
            userId: "user-1",
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
            userId: "user-1",
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

  // A form submit names its stored widget, and the database comes from there,
  // never from the request (#1824). The editor offers no write-mode flag for a
  // form, so a saved form carries no allowWrites.
  describe("form submit on the form's saved database (#1824)", () => {
    const formSubmit = {
      connectionId: "c1",
      query: "CREATE (n:Test)",
      widgetId: "w-form",
      dashboardId: "d1",
    };

    /**
     * The dashboard row holding one form, saved on the neoboard database. The
     * caller owns the dashboard unless `dashboard` says otherwise.
     */
    function storedForm(
      widget: Record<string, unknown> = {},
      dashboard: Record<string, unknown> = {},
    ) {
      return drizzleSelectChain([
        {
          id: "d1",
          tenantId: "tenant-a",
          userId: "user-1",
          ...dashboard,
          layoutJson: {
            version: 2,
            pages: [
              {
                id: "p1",
                title: "Page 1",
                widgets: [
                  {
                    id: "w-form",
                    chartType: "form",
                    connectionId: "c1",
                    query: "CREATE (n:Test)",
                    database: "neoboard",
                    ...widget,
                  },
                ],
                gridLayout: [],
              },
            ],
          },
        },
      ]);
    }
    const perCardConnection = () =>
      drizzleSelectChain([{ ...fakeConnection, allowPerCardDb: true }]);
    /** The caller's shares on a dashboard someone else owns. */
    const shares = (...roles: string[]) =>
      drizzleSelectChain(roles.map((role) => ({ role })));
    const queueSelects = (...chains: unknown[]) => {
      for (const chain of chains) mockDb.select.mockReturnValueOnce(chain);
    };

    beforeEach(() => {
      mockRequireSession.mockResolvedValue(writerSession);
      mockDecryptJson.mockReturnValue({
        uri: "bolt://localhost",
        username: "neo4j",
        password: "pass",
        database: "movies",
      });
      mockExecuteQuery.mockResolvedValue({ data: [] });
    });

    // The submit's dashboard must be one the caller can open, at the viewer
    // level every dashboard route uses: owner, share, public, or admin.
    it.each([
      ["owner", writerSession, [storedForm()]],
      [
        "viewer share",
        writerSession,
        [storedForm({}, { userId: "user-other" }), shares("viewer")],
      ],
      [
        "public dashboard",
        writerSession,
        [storedForm({}, { userId: "user-other", isPublic: true }), shares()],
      ],
      [
        "admin",
        { ...writerSession, role: "admin" },
        [storedForm({}, { userId: "user-other" })],
      ],
    ])(
      "writes a stored form on a dashboard the caller can open (%s), on its saved database",
      async (_, session, dashboardSelects) => {
        mockRequireSession.mockResolvedValue(session);
        queueSelects(perCardConnection(), ...dashboardSelects);

        const res = await POST(makeRequest(formSubmit));

        expect(res.status).toBe(200);
        expect(mockExecuteQuery).toHaveBeenCalledWith(
          "neo4j",
          expect.objectContaining({ database: "neoboard" }),
          expect.any(Object),
          { accessMode: "WRITE" },
        );
      },
    );

    // A form that is not on a dashboard the caller can open, on this
    // connection, gets one refusal whatever the reason.
    it.each([
      [
        "a dashboard the caller cannot open",
        [storedForm({}, { userId: "user-other" }), shares()],
      ],
      [
        "a widget without write mode on a dashboard the caller cannot open",
        [
          storedForm({ chartType: "table" }, { userId: "user-other" }),
          shares(),
        ],
      ],
      ["a widget the dashboard does not hold", [storedForm({ id: "w-other" })]],
      [
        "a widget on another connection",
        [storedForm({ connectionId: "c-other" })],
      ],
    ])(
      "refuses %s exactly as a dashboard that does not exist, and runs nothing",
      async (_, dashboardSelects) => {
        queueSelects(perCardConnection(), drizzleSelectChain([]));
        const missing = await POST(makeRequest(formSubmit));
        queueSelects(perCardConnection(), ...dashboardSelects);
        const refused = await POST(makeRequest(formSubmit));

        expect(missing.status).toBe(404);
        expect(refused.status).toBe(missing.status);
        expect(await refused.json()).toEqual(await missing.json());
        expect(mockExecuteQuery).not.toHaveBeenCalled();
      },
    );

    it("checks dashboard access as the session's user, role and tenant", async () => {
      const session = { ...writerSession, tenantId: "tenant-b" };
      mockRequireSession.mockResolvedValue(session);
      queueSelects(perCardConnection(), storedForm());

      const res = await POST(makeRequest(formSubmit));

      expect(res.status).toBe(200);
      expect(accessChecks).toHaveBeenCalledWith(
        expect.objectContaining({
          dashboardId: "d1",
          tenantId: "tenant-b",
          userId: session.userId,
          userRole: session.role,
          required: "viewer",
        }),
      );
    });

    it("never writes on a database the request names", async () => {
      mockDb.select
        .mockReturnValueOnce(perCardConnection())
        .mockReturnValueOnce(storedForm())
        .mockReturnValueOnce(perCardConnection());

      await POST(makeRequest({ ...formSubmit, database: "archive" }));
      await POST(
        makeRequest({
          connectionId: "c1",
          query: "CREATE (n:Test)",
          database: "archive",
        }),
      );

      expect(mockExecuteQuery).toHaveBeenCalledTimes(2);
      expect(mockExecuteQuery.mock.calls[0][1].database).toBe("neoboard");
      expect(mockExecuteQuery.mock.calls[1][1].database).toBe("movies");
    });

    it("refuses a submit on a connection the caller does not own, before reading the dashboard", async () => {
      mockDb.select.mockReturnValueOnce(drizzleSelectChain([]));

      const res = await POST(makeRequest(formSubmit));

      expect(res.status).toBe(404);
      expect(mockDb.select).toHaveBeenCalledTimes(1);
      expect(mockExecuteQuery).not.toHaveBeenCalled();
    });

    it("refuses a submit from a user without write permission, before any lookup", async () => {
      mockRequireSession.mockResolvedValue(readerSession);

      const res = await POST(makeRequest(formSubmit));

      expect(res.status).toBe(403);
      expect(mockDb.select).not.toHaveBeenCalled();
    });

    it("still requires write mode on a stored widget that is not a form", async () => {
      mockDb.select
        .mockReturnValueOnce(perCardConnection())
        .mockReturnValueOnce(storedForm({ chartType: "table" }));

      const res = await POST(makeRequest(formSubmit));

      expect(res.status).toBe(403);
      expect((await res.json()).error.message).toMatch(
        /write mode.*not enabled/i,
      );
      expect(mockExecuteQuery).not.toHaveBeenCalled();
    });
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
