import { describe, it, expect, vi, beforeEach } from "vitest";
import { toConnectorError } from "@neoboard/connection";
import { makeRequest } from "@/__tests__/helpers/request-helpers";
import { nextResponseMockFactory } from "@/__tests__/helpers/next-mocks";
import {
  makeSelectChain,
  sqlColumns,
  sqlValues,
} from "@/__tests__/helpers/drizzle-mocks";
import { getTableName, type Table } from "drizzle-orm";

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
/** Records each query context the route runs; the real pipeline still runs it. */
const pipelineRuns = vi.fn();

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
vi.mock("@/lib/query/pipeline", async (importOriginal) => {
  const real = await importOriginal<typeof import("@/lib/query/pipeline")>();
  return {
    ...real,
    runPipeline: (...args: Parameters<typeof real.runPipeline>) => {
      pipelineRuns(args[0]);
      return real.runPipeline(...args);
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

/**
 * Sets up the dashboard lookup, then the connection lookup: the route reads the
 * dashboard first, to learn whether the write is a saved form's (#1831).
 */
function mockDashboardAndConnection() {
  mockDb.select
    .mockReturnValueOnce(makeSelectChain([fakeDashboard]))
    .mockReturnValueOnce(makeSelectChain([fakeConnection]));
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
    mockDb.select.mockReturnValue(makeSelectChain([]));
    const res = await POST(
      makeRequest({
        connectionId: "c1",
        query: "CREATE (n:Test)",
      }),
    );
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error.message).toMatch(/not found/i);
  });

  it("returns 200 on success and calls executeQuery with accessMode WRITE", async () => {
    mockRequireSession.mockResolvedValue(writerSession);
    mockDashboardAndConnection();
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
    mockDashboardAndConnection();
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
    mockDashboardAndConnection();
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
    mockDashboardAndConnection();
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
    // Opaque to the app: the connector that owns the error says what it is.
    mockExecuteQuery.mockRejectedValue(toConnectorError("postgresql", pgError));

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

  const PG = "postgresql";
  it.each([
    [PG, "23505", 409, "A record with these values already exists."],
    [PG, "23514", 400, "A value failed a validation constraint."],
    [
      PG,
      "25006",
      403,
      "This connection is read-only; writes are not permitted.",
    ],
    [PG, "22001", 400, "A value is too long."],
    [PG, "22007", 400, "A date or time value is invalid."],
    [PG, "23P01", 400, "A record conflicts with an existing one."],
    [
      "neo4j",
      "Neo.ClientError.Schema.ConstraintValidationFailed",
      400,
      "A value violates a database constraint.",
    ],
  ])(
    "responds to a %s driver error %s its connector recognises with %i, not 500 (#1409)",
    async (connector, code, status, message) => {
      mockRequireSession.mockResolvedValue(writerSession);
      mockDashboardAndConnection();
      mockDecryptJson.mockReturnValue({ uri: "postgresql://localhost" });
      const driverError = Object.assign(new Error("INSERT INTO t ... secret"), {
        code,
      });
      mockExecuteQuery.mockRejectedValue(
        toConnectorError(connector, driverError),
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
    mockDb.select.mockReturnValue(makeSelectChain([]));
    const res = await POST(
      makeRequest({
        connectionId: "c1",
        query: "CREATE (n:Test)",
      }),
    );
    expect(res.status).toBe(404);
  });

  it("returns 404 when connection belongs to a different tenant", async () => {
    mockRequireSession.mockResolvedValue({
      ...writerSession,
      tenantId: "tenant-other",
    });
    mockDb.select.mockReturnValue(makeSelectChain([]));
    const res = await POST(
      makeRequest({
        connectionId: "c1",
        query: "CREATE (n:Test)",
      }),
    );
    expect(res.status).toBe(404);
  });

  it("returns 403 when widget allowWrites is false", async () => {
    mockRequireSession.mockResolvedValue(writerSession);
    // First select: dashboard found. Second select: connection found.
    mockDb.select
      .mockReturnValueOnce(
        makeSelectChain([
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
      )
      .mockReturnValueOnce(makeSelectChain([fakeConnection]));

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
    mockDb.select.mockReturnValue(makeSelectChain([fakeConnection]));
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
      .mockReturnValueOnce(
        makeSelectChain([
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
      )
      .mockReturnValueOnce(makeSelectChain([fakeConnection]));
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
    mockDb.select.mockReturnValueOnce(makeSelectChain([])); // dashboard not found

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
        makeSelectChain([
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
      )
      .mockReturnValueOnce(
        makeSelectChain([{ ...fakeConnection, allowPerCardDb: true }]),
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
        makeSelectChain([
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
      )
      .mockReturnValueOnce(
        makeSelectChain([{ ...fakeConnection, allowPerCardDb: false }]),
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
      .mockReturnValueOnce(
        makeSelectChain([
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
      )
      .mockReturnValueOnce(makeSelectChain([fakeConnection]));

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

  // A form submit names its stored widget and dashboard (#1824). Everyone who
  // can open that dashboard may submit it, and the route runs only what the
  // form saves: its query, its own fields' parameters, its connection and its
  // database (#1831). Every other write keeps write permission and connection
  // ownership.
  describe("form submits (#1824, #1831)", () => {
    const FORM_QUERY = "CREATE (n:Test {tag: $param_tag})";
    const formSubmit = {
      connectionId: "c1",
      query: FORM_QUERY,
      params: { param_tag: "t" },
      widgetId: "w-form",
      dashboardId: "d1",
    };
    /** A writer who owns neither the connection nor the dashboard. */
    const otherWriter = {
      userId: "user-3",
      tenantId: "tenant-a",
      role: "creator",
      canWrite: true,
    };

    /**
     * The dashboard row holding one form with a text field `tag`, saved on the
     * neoboard database. The connection's owner owns the dashboard unless
     * `dashboard` says otherwise.
     */
    function storedForm(
      widget: Record<string, unknown> = {},
      dashboard: Record<string, unknown> = {},
    ) {
      return makeSelectChain([
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
                    query: FORM_QUERY,
                    database: "neoboard",
                    settings: {
                      formFields: [
                        {
                          id: "f-tag",
                          label: "Tag",
                          parameterName: "tag",
                          parameterType: "text",
                          required: true,
                        },
                      ],
                    },
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
      makeSelectChain([{ ...fakeConnection, allowPerCardDb: true }]);
    /** The caller's shares on a dashboard someone else owns. */
    const shares = (...roles: string[]) =>
      makeSelectChain(roles.map((role) => ({ role })));
    const queueSelects = (...chains: unknown[]) => {
      for (const chain of chains) mockDb.select.mockReturnValueOnce(chain);
    };
    /** Each select the route made: the table it read and the filter it used. */
    const lookups = () =>
      mockDb.select.mock.results.map(({ value }) => {
        const { calls } = value as ReturnType<typeof makeSelectChain>;
        return {
          table: getTableName(calls.from[0][0] as Table),
          filter: calls.where[0]?.[0],
        };
      });
    /** A lookup's filter as [column, value] pairs, sorted by column. */
    const pairs = (filter: unknown) => {
      const values = sqlValues(filter);
      return sqlColumns(filter)
        .map((column, i) => [column, values[i]])
        .sort();
    };
    const connectionFilter = () =>
      lookups().find(({ table }) => table === "connection")?.filter;

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

    // Viewer level, as every dashboard route opens a dashboard: owner, share,
    // public, or admin. Neither write permission nor who owns the connection
    // enters into it.
    it.each([
      ["the dashboard's owner", writerSession, [storedForm()]],
      ["an editor share", otherWriter, [storedForm(), shares("editor")]],
      ["a viewer share", otherWriter, [storedForm(), shares("viewer")]],
      ["an admin", { ...otherWriter, role: "admin" }, [storedForm()]],
      [
        "a reader, whose write permission is off, through a viewer share",
        readerSession,
        [storedForm(), shares("viewer")],
      ],
      [
        "a creator with write permission off, on a public dashboard",
        { ...otherWriter, canWrite: false },
        [storedForm({}, { isPublic: true }), shares()],
      ],
    ])(
      "runs the saved form for %s, on its saved connection and database",
      async (_, session, dashboardSelects) => {
        mockRequireSession.mockResolvedValue(session);
        queueSelects(...dashboardSelects, perCardConnection());

        const res = await POST(makeRequest(formSubmit));

        expect(res.status).toBe(200);
        expect(mockExecuteQuery).toHaveBeenCalledTimes(1);
        expect(mockExecuteQuery).toHaveBeenCalledWith(
          "neo4j",
          expect.objectContaining({ database: "neoboard" }),
          { query: FORM_QUERY, params: { param_tag: "t" } },
          { accessMode: "WRITE" },
        );
        // The form's own connection, in the caller's tenant, whoever owns it.
        expect(pairs(connectionFilter())).toEqual([
          ["id", "c1"],
          ["tenant_id", session.tenantId],
        ]);
        // The query audit trail (query/middleware/audit.ts) logs the submitter.
        expect(pipelineRuns).toHaveBeenCalledWith(
          expect.objectContaining({
            userId: session.userId,
            tenantId: session.tenantId,
            accessMode: "write",
            query: FORM_QUERY,
          }),
        );
      },
    );

    it("binds only the parameters of the form's own fields, and ignores any other", async () => {
      mockRequireSession.mockResolvedValue(otherWriter);
      const formFields = [
        {
          id: "f-tag",
          label: "Tag",
          parameterName: "tag",
          parameterType: "text",
        },
        {
          id: "f-when",
          label: "When",
          parameterName: "when",
          parameterType: "date-range",
        },
        {
          id: "f-size",
          label: "Size",
          parameterName: "size",
          parameterType: "number-range",
        },
      ];
      queueSelects(
        storedForm({ settings: { formFields } }),
        shares("viewer"),
        perCardConnection(),
      );
      const fieldParams = {
        param_tag: "t",
        param_when_from: "2026-01-01",
        param_when_to: "2026-01-31",
        param_size_min: 1,
        param_size_max: 9,
      };

      const res = await POST(
        makeRequest({
          ...formSubmit,
          params: {
            ...fieldParams,
            param_owner: "mallory",
            param_when: "2026-01-01",
            param_size: 5,
            tag: "raw",
          },
        }),
      );

      expect(res.status).toBe(200);
      expect(mockExecuteQuery.mock.calls[0][2]).toEqual({
        query: FORM_QUERY,
        params: fieldParams,
      });
    });

    it("binds nothing for a saved form without fields", async () => {
      queueSelects(storedForm({ settings: {} }), perCardConnection());

      const res = await POST(makeRequest(formSubmit));

      expect(res.status).toBe(200);
      expect(mockExecuteQuery.mock.calls[0][2]).toEqual({
        query: FORM_QUERY,
        params: {},
      });
    });

    // A request that does not name a form this dashboard saves, on this
    // connection, for a caller who can open the dashboard, gets one refusal
    // whatever the reason, and nothing past the dashboard is read or run.
    it.each([
      [
        "a dashboard the caller cannot open",
        otherWriter,
        [storedForm(), shares()],
      ],
      [
        "a widget without write mode on a dashboard the caller cannot open",
        otherWriter,
        [storedForm({ chartType: "table" }), shares()],
      ],
      [
        "a form the dashboard has not saved",
        writerSession,
        [storedForm({ id: "w-saved-earlier" })],
      ],
      [
        "a widget on another dashboard",
        otherWriter,
        [storedForm({ id: "w-this-dashboard" }), shares("viewer")],
      ],
      [
        "a widget on another connection",
        writerSession,
        [storedForm({ connectionId: "c-other" })],
      ],
    ])(
      "refuses %s exactly as a dashboard that does not exist, and runs nothing",
      async (_, session, dashboardSelects) => {
        mockRequireSession.mockResolvedValue(session);
        queueSelects(makeSelectChain([]));
        const missing = await POST(makeRequest(formSubmit));
        queueSelects(...dashboardSelects);
        const refused = await POST(makeRequest(formSubmit));

        expect(missing.status).toBe(404);
        expect(refused.status).toBe(missing.status);
        expect(await refused.json()).toEqual(await missing.json());
        expect(mockExecuteQuery).not.toHaveBeenCalled();
        expect(lookups().map(({ table }) => table)).not.toContain("connection");
      },
    );

    it.each([
      ["the connection's owner", writerSession, [storedForm()]],
      ["a viewer share", otherWriter, [storedForm(), shares("viewer")]],
    ])(
      "never runs query text that a submit from %s sends in place of the form's saved query",
      async (_, session, dashboardSelects) => {
        mockRequireSession.mockResolvedValue(session);
        queueSelects(makeSelectChain([]));
        const missing = await POST(makeRequest(formSubmit));
        queueSelects(...dashboardSelects, perCardConnection());
        const tampered = await POST(
          makeRequest({ ...formSubmit, query: "MATCH (n) DETACH DELETE n" }),
        );

        expect(tampered.status).toBe(404);
        expect(await tampered.json()).toEqual(await missing.json());
        expect(mockExecuteQuery).not.toHaveBeenCalled();
      },
    );

    it("looks for the dashboard in the caller's own tenant", async () => {
      mockRequireSession.mockResolvedValue({
        ...writerSession,
        tenantId: "tenant-b",
      });
      queueSelects(makeSelectChain([]));

      const res = await POST(makeRequest(formSubmit));

      expect(res.status).toBe(404);
      expect(sqlValues(lookups()[0].filter)).toEqual(["d1", "tenant-b"]);
      expect(mockExecuteQuery).not.toHaveBeenCalled();
    });

    it("checks dashboard access as the session's user, role and tenant", async () => {
      const session = { ...writerSession, tenantId: "tenant-b" };
      mockRequireSession.mockResolvedValue(session);
      queueSelects(storedForm(), perCardConnection());

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
        .mockReturnValueOnce(storedForm())
        .mockReturnValueOnce(perCardConnection())
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

    it("runs a form on its connection's default database when the connection allows no per-card database", async () => {
      queueSelects(
        storedForm(),
        makeSelectChain([{ ...fakeConnection, allowPerCardDb: false }]),
      );

      const res = await POST(makeRequest(formSubmit));

      expect(res.status).toBe(200);
      expect(mockExecuteQuery.mock.calls[0][1].database).toBe("movies");
    });

    describe("any other write keeps write permission and connection ownership", () => {
      const tableWithWriteMode = () =>
        storedForm({ chartType: "table", allowWrites: true });

      it("refuses a user without write permission before any lookup, when no widget is named", async () => {
        mockRequireSession.mockResolvedValue(readerSession);

        const res = await POST(
          makeRequest({ connectionId: "c1", query: FORM_QUERY }),
        );

        expect(res.status).toBe(403);
        expect(mockDb.select).not.toHaveBeenCalled();
      });

      it.each([
        ["a reader", readerSession],
        [
          "a creator with write permission off",
          { ...otherWriter, canWrite: false },
        ],
      ])(
        "refuses %s a widget with write mode on, on a dashboard they can open",
        async (_, session) => {
          mockRequireSession.mockResolvedValue(session);
          queueSelects(
            tableWithWriteMode(),
            shares("viewer"),
            perCardConnection(),
          );

          const res = await POST(makeRequest(formSubmit));

          expect(res.status).toBe(403);
          expect((await res.json()).error.message).toMatch(
            /write permission required/i,
          );
          expect(mockExecuteQuery).not.toHaveBeenCalled();
        },
      );

      it("refuses a widget with write mode on to a writer who does not own its connection", async () => {
        mockRequireSession.mockResolvedValue(otherWriter);
        // The owner filter finds no connection of theirs.
        queueSelects(
          tableWithWriteMode(),
          shares("viewer"),
          makeSelectChain([]),
        );

        const res = await POST(makeRequest(formSubmit));

        expect(res.status).toBe(404);
        expect((await res.json()).error.message).toMatch(
          /connection not found/i,
        );
        expect(pairs(connectionFilter())).toEqual([
          ["id", "c1"],
          ["tenant_id", "tenant-a"],
          ["userId", "user-3"],
        ]);
        expect(mockExecuteQuery).not.toHaveBeenCalled();
      });

      it("runs a write that names no widget as sent, on the caller's own connection", async () => {
        queueSelects(perCardConnection());

        const res = await POST(
          makeRequest({
            connectionId: "c1",
            query: "CREATE (n:Free {v: $anything})",
            params: { anything: 1 },
          }),
        );

        expect(res.status).toBe(200);
        expect(pairs(connectionFilter())).toEqual([
          ["id", "c1"],
          ["tenant_id", "tenant-a"],
          ["userId", "user-1"],
        ]);
        expect(mockExecuteQuery.mock.calls[0][2]).toEqual({
          query: "CREATE (n:Free {v: $anything})",
          params: { anything: 1 },
        });
      });

      it("still requires write mode on a stored widget that is not a form", async () => {
        queueSelects(storedForm({ chartType: "table" }), perCardConnection());

        const res = await POST(makeRequest(formSubmit));

        expect(res.status).toBe(403);
        expect((await res.json()).error.message).toMatch(
          /write mode.*not enabled/i,
        );
        expect(mockExecuteQuery).not.toHaveBeenCalled();
      });
    });
  });

  it("does not apply MAX_ROWS truncation on write results", async () => {
    mockRequireSession.mockResolvedValue(writerSession);
    mockDashboardAndConnection();
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
