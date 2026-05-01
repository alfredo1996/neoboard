import { describe, it, expect, vi, beforeEach } from "vitest";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockRunQuery = vi.fn();
const mockCheckConnection = vi.fn();
const mockCreateConnectionModule = vi.fn(() => ({
  runQuery: mockRunQuery,
  checkConnection: mockCheckConnection,
}));

vi.mock("@/lib/connector/connection-adapter", () => ({
  createConnectionModule: mockCreateConnectionModule,
  DEFAULT_CONNECTION_CONFIG: { connectionTimeout: 30000, timeout: 30000 },
  ConnectionTypes: { NEO4J: 1, POSTGRESQL: 2 },
}));

// Mirror the QueryStatus enum from @neoboard/connection (integer values are
// declaration order in the real enum). Only COMPLETE_TRUNCATED = 7 matters
// for the executor's setStatus handler — everything else is a no-op.
vi.mock("@neoboard/connection", () => ({
  QueryStatus: {
    NO_QUERY: 0,
    NO_DATA: 1,
    NO_DRAWABLE_DATA: 2,
    WAITING: 3,
    RUNNING: 4,
    TIMED_OUT: 5,
    COMPLETE: 6,
    COMPLETE_TRUNCATED: 7,
    ERROR: 8,
  },
}));

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("query-executor", () => {
  let executeQuery: typeof import("@/lib/query/query-executor").executeQuery;
  let testConnection: typeof import("@/lib/query/query-executor").testConnection;

  beforeEach(async () => {
    vi.clearAllMocks();
    vi.resetModules();
    vi.doMock("../connection-adapter", () => ({
      createConnectionModule: mockCreateConnectionModule,
      DEFAULT_CONNECTION_CONFIG: { connectionTimeout: 30000, timeout: 30000 },
      ConnectionTypes: { NEO4J: 1, POSTGRESQL: 2 },
    }));
    const mod = await import("@/lib/query/query-executor");
    executeQuery = mod.executeQuery;
    testConnection = mod.testConnection;
  });

  const neo4jCreds = {
    uri: "bolt://localhost:7687",
    username: "neo4j",
    password: "password",
  };

  const pgCreds = {
    uri: "postgresql://localhost:5432/testdb",
    username: "postgres",
    password: "password",
    database: "testdb",
  };

  // -----------------------------------------------------------------------
  // executeQuery — basic
  // -----------------------------------------------------------------------

  it("creates a connection module and resolves on onSuccess with truncation metadata", async () => {
    mockRunQuery.mockImplementation(
      (_p: unknown, cbs: { onSuccess: (v: unknown) => void }) => {
        cbs.onSuccess([{ n: 1 }]);
      },
    );

    const result = await executeQuery("neo4j", neo4jCreds, {
      query: "RETURN 1 AS n",
    });
    expect(mockCreateConnectionModule).toHaveBeenCalledWith(
      "neo4j", // string type for registry
      expect.objectContaining({ uri: neo4jCreds.uri, username: "neo4j" }),
      expect.any(Object),
    );
    // New shape: data + rowLimit (effective cap) + truncated flag.
    // Without a setStatus(COMPLETE_TRUNCATED) call, truncated is false
    // and rowLimit echoes DEFAULT_MAX_ROWS (5000).
    expect(result).toEqual({
      data: [{ n: 1 }],
      truncated: false,
      rowLimit: 5000,
    });
  });

  it("rejects when runQuery calls onFail", async () => {
    mockRunQuery.mockImplementation(
      (_p: unknown, cbs: { onFail: (v: unknown) => void }) => {
        cbs.onFail(new Error("Connection refused"));
      },
    );

    await expect(
      executeQuery("neo4j", neo4jCreds, { query: "RETURN 1" }),
    ).rejects.toThrow("Connection refused");
  });

  // -----------------------------------------------------------------------
  // executeQuery — truncation signal (issue #499)
  // -----------------------------------------------------------------------

  it("captures truncated:true when driver calls setStatus(COMPLETE_TRUNCATED)", async () => {
    // Simulates the connector module reporting that the result was capped
    // at the configured rowLimit. The executor's setStatus handler should
    // flip its internal `truncated` flag, which then surfaces in the
    // resolved value.
    mockRunQuery.mockImplementation(
      (
        _p: unknown,
        cbs: {
          onSuccess: (v: unknown) => void;
          setStatus?: (s: number) => void;
        },
      ) => {
        cbs.setStatus?.(7); // QueryStatus.COMPLETE_TRUNCATED
        cbs.onSuccess(Array.from({ length: 5000 }, (_, i) => ({ n: i })));
      },
    );

    const result = await executeQuery("postgresql", pgCreds, {
      query: "SELECT * FROM big_table",
    });

    expect(result.truncated).toBe(true);
    expect(result.rowLimit).toBe(5000);
    expect((result.data as unknown[]).length).toBe(5000);
  });

  it("does NOT mark truncated when driver only reports COMPLETE", async () => {
    mockRunQuery.mockImplementation(
      (
        _p: unknown,
        cbs: {
          onSuccess: (v: unknown) => void;
          setStatus?: (s: number) => void;
        },
      ) => {
        cbs.setStatus?.(6); // QueryStatus.COMPLETE — not truncated
        cbs.onSuccess([{ n: 1 }]);
      },
    );

    const result = await executeQuery("postgresql", pgCreds, {
      query: "SELECT 1",
    });

    expect(result.truncated).toBe(false);
    expect(result.rowLimit).toBe(5000);
  });

  it("does NOT mark truncated when driver omits setStatus entirely", async () => {
    // Defensive: make sure missing setStatus calls don't set truncated.
    mockRunQuery.mockImplementation(
      (_p: unknown, cbs: { onSuccess: (v: unknown) => void }) => {
        cbs.onSuccess([{ n: 1 }]);
      },
    );

    const result = await executeQuery("neo4j", neo4jCreds, {
      query: "RETURN 1",
    });

    expect(result.truncated).toBe(false);
    expect(result.rowLimit).toBe(5000);
  });

  // -----------------------------------------------------------------------
  // executeQuery — per-connection maxRows override
  // -----------------------------------------------------------------------

  it("uses credentials.maxRows when set instead of DEFAULT_MAX_ROWS", async () => {
    let capturedConfig: Record<string, unknown> = {};
    mockRunQuery.mockImplementation(
      (
        _p: unknown,
        cbs: { onSuccess: (v: unknown) => void },
        config: Record<string, unknown>,
      ) => {
        capturedConfig = config;
        cbs.onSuccess([{ n: 1 }]);
      },
    );

    const creds = { ...pgCreds, maxRows: 25_000 };
    const result = await executeQuery("postgresql", creds, {
      query: "SELECT 1",
    });

    // Driver receives the override via config.rowLimit so it can slice
    // at the right point on its side.
    expect(capturedConfig.rowLimit).toBe(25_000);
    // And the executor echoes the effective cap back to the caller so the
    // API route can forward it to the UI banner.
    expect(result.rowLimit).toBe(25_000);
  });

  it("falls back to DEFAULT_MAX_ROWS (5000) when credentials.maxRows is undefined", async () => {
    let capturedConfig: Record<string, unknown> = {};
    mockRunQuery.mockImplementation(
      (
        _p: unknown,
        cbs: { onSuccess: (v: unknown) => void },
        config: Record<string, unknown>,
      ) => {
        capturedConfig = config;
        cbs.onSuccess([{ n: 1 }]);
      },
    );

    const result = await executeQuery("postgresql", pgCreds, {
      query: "SELECT 1",
    });

    expect(capturedConfig.rowLimit).toBe(5000);
    expect(result.rowLimit).toBe(5000);
  });

  // -----------------------------------------------------------------------
  // executeQuery — connection type mapping
  // -----------------------------------------------------------------------

  it("uses POSTGRESQL type for postgresql", async () => {
    mockRunQuery.mockImplementation(
      (_p: unknown, cbs: { onSuccess: (v: unknown) => void }) => {
        cbs.onSuccess([]);
      },
    );

    await executeQuery("postgresql", pgCreds, { query: "SELECT 1" });
    expect(mockCreateConnectionModule).toHaveBeenCalledWith(
      "postgresql", // string type for registry
      expect.anything(),
      expect.anything(),
    );
  });

  // -----------------------------------------------------------------------
  // executeQuery — config options
  // -----------------------------------------------------------------------

  it("passes accessMode when provided", async () => {
    let capturedConfig: Record<string, unknown> = {};
    mockRunQuery.mockImplementation(
      (
        _p: unknown,
        cbs: { onSuccess: (v: unknown) => void },
        config: Record<string, unknown>,
      ) => {
        capturedConfig = config;
        cbs.onSuccess([]);
      },
    );

    await executeQuery(
      "neo4j", // string type for registry
      neo4jCreds,
      { query: "CREATE (n)" },
      { accessMode: "WRITE" },
    );
    expect(capturedConfig.accessMode).toBe("WRITE");
  });

  it("passes queryTimeout and connectionTimeout overrides", async () => {
    let capturedConfig: Record<string, unknown> = {};
    mockRunQuery.mockImplementation(
      (
        _p: unknown,
        cbs: { onSuccess: (v: unknown) => void },
        config: Record<string, unknown>,
      ) => {
        capturedConfig = config;
        cbs.onSuccess([]);
      },
    );

    const creds = {
      ...neo4jCreds,
      queryTimeout: 5000,
      connectionTimeout: 3000,
    };
    await executeQuery("neo4j", creds, { query: "RETURN 1" });
    expect(capturedConfig.timeout).toBe(5000);
    expect(capturedConfig.connectionTimeout).toBe(3000);
  });

  it("spreads DEFAULT_CONNECTION_CONFIG into query config", async () => {
    let capturedConfig: Record<string, unknown> = {};
    mockRunQuery.mockImplementation(
      (
        _p: unknown,
        cbs: { onSuccess: (v: unknown) => void },
        config: Record<string, unknown>,
      ) => {
        capturedConfig = config;
        cbs.onSuccess([]);
      },
    );

    await executeQuery("neo4j", neo4jCreds, { query: "RETURN 1" });
    // DEFAULT_CONNECTION_CONFIG has connectionTimeout: 30000 and timeout: 30000
    expect(capturedConfig.connectionTimeout).toBe(30000);
  });

  // -----------------------------------------------------------------------
  // executeQuery — PostgreSQL param rewriting
  // -----------------------------------------------------------------------

  it("rewrites $param_ tokens for postgresql queries", async () => {
    let capturedParams: unknown = null;
    mockRunQuery.mockImplementation(
      (p: unknown, cbs: { onSuccess: (v: unknown) => void }) => {
        capturedParams = p;
        cbs.onSuccess([]);
      },
    );

    await executeQuery("postgresql", pgCreds, {
      query: "SELECT * FROM t WHERE name = $param_name",
      params: { param_name: "Alice" },
    });

    const params = capturedParams as {
      query: string;
      params: Record<string, unknown>;
    };
    expect(params.query).toContain("$1");
    expect(params.query).not.toContain("$param_name");
  });

  it("does NOT rewrite params for neo4j queries", async () => {
    let capturedParams: unknown = null;
    mockRunQuery.mockImplementation(
      (p: unknown, cbs: { onSuccess: (v: unknown) => void }) => {
        capturedParams = p;
        cbs.onSuccess([]);
      },
    );

    await executeQuery("neo4j", neo4jCreds, {
      query: "MATCH (n {name: $param_name}) RETURN n",
      params: { param_name: "Alice" },
    });

    const params = capturedParams as {
      query: string;
      params: Record<string, unknown>;
    };
    expect(params.query).toContain("$param_name");
  });

  // -----------------------------------------------------------------------
  // executeQuery — advanced options
  // -----------------------------------------------------------------------

  it("passes advanced options to createConnectionModule", async () => {
    mockRunQuery.mockImplementation(
      (_p: unknown, cbs: { onSuccess: (v: unknown) => void }) => {
        cbs.onSuccess([]);
      },
    );

    const creds = {
      ...neo4jCreds,
      connectionTimeout: 5000,
      queryTimeout: 10000,
      maxPoolSize: 20,
      connectionAcquisitionTimeout: 8000,
      idleTimeout: 15000,
      statementTimeout: 60000,
      sslRejectUnauthorized: false,
    };

    await executeQuery("neo4j", creds, { query: "RETURN 1" });
    expect(mockCreateConnectionModule).toHaveBeenCalledWith(
      "neo4j", // string type for registry
      expect.anything(),
      expect.objectContaining({
        neo4jConnectionTimeout: 5000,
        neo4jQueryTimeout: 10000,
        neo4jMaxPoolSize: 20,
        neo4jAcquisitionTimeout: 8000,
        pgConnectionTimeoutMillis: 5000,
        pgIdleTimeoutMillis: 15000,
        pgMaxPoolSize: 20,
        pgStatementTimeout: 60000,
        pgSslRejectUnauthorized: false,
      }),
    );
  });

  // -----------------------------------------------------------------------
  // Module caching
  // -----------------------------------------------------------------------

  it("reuses cached module for same credentials", async () => {
    mockRunQuery.mockImplementation(
      (_p: unknown, cbs: { onSuccess: (v: unknown) => void }) => {
        cbs.onSuccess([]);
      },
    );

    await executeQuery("neo4j", neo4jCreds, { query: "RETURN 1" });
    await executeQuery("neo4j", neo4jCreds, { query: "RETURN 2" });
    expect(mockCreateConnectionModule).toHaveBeenCalledTimes(1);
  });

  it("creates new module for different credentials", async () => {
    mockRunQuery.mockImplementation(
      (_p: unknown, cbs: { onSuccess: (v: unknown) => void }) => {
        cbs.onSuccess([]);
      },
    );

    await executeQuery("neo4j", neo4jCreds, { query: "RETURN 1" });
    await executeQuery(
      "neo4j", // string type for registry
      { ...neo4jCreds, uri: "bolt://other:7687" },
      { query: "RETURN 2" },
    );
    expect(mockCreateConnectionModule).toHaveBeenCalledTimes(2);
  });

  // -----------------------------------------------------------------------
  // testConnection
  // -----------------------------------------------------------------------

  it("calls checkConnection and returns true", async () => {
    mockCheckConnection.mockResolvedValue(true);
    const result = await testConnection("neo4j", neo4jCreds);
    expect(result).toBe(true);
    expect(mockCheckConnection).toHaveBeenCalledWith(
      expect.objectContaining({ connectionType: 1, connectionTimeout: 30000 }),
    );
  });

  it("returns false when checkConnection fails", async () => {
    mockCheckConnection.mockResolvedValue(false);
    const result = await testConnection("postgresql", pgCreds);
    expect(result).toBe(false);
  });

  it("passes database to testConnection config", async () => {
    mockCheckConnection.mockResolvedValue(true);
    await testConnection("postgresql", pgCreds);
    expect(mockCheckConnection).toHaveBeenCalledWith(
      expect.objectContaining({ database: "testdb" }),
    );
  });

  // -----------------------------------------------------------------------
  // listDatabases
  // -----------------------------------------------------------------------

  describe("listDatabases", () => {
    let listDatabases: typeof import("@/lib/query/query-executor").listDatabases;

    beforeEach(async () => {
      vi.clearAllMocks();
      vi.resetModules();
      vi.doMock("../connection-adapter", () => ({
        createConnectionModule: mockCreateConnectionModule,
        DEFAULT_CONNECTION_CONFIG: { connectionTimeout: 30000, timeout: 30000 },
        ConnectionTypes: { NEO4J: 1, POSTGRESQL: 2 },
      }));
      const mod = await import("@/lib/query/query-executor");
      listDatabases = mod.listDatabases;
    });

    it("returns databases from the connection module", async () => {
      const mockListDbs = vi.fn().mockResolvedValue(["neo4j", "movies"]);
      mockCreateConnectionModule.mockReturnValue({
        runQuery: mockRunQuery,
        checkConnection: mockCheckConnection,
        listDatabases: mockListDbs,
      });

      const result = await listDatabases("neo4j", neo4jCreds);
      expect(result).toEqual(["neo4j", "movies"]);
      expect(mockListDbs).toHaveBeenCalled();
    });

    it("creates module with correct credentials", async () => {
      const mockListDbs = vi.fn().mockResolvedValue([]);
      mockCreateConnectionModule.mockReturnValue({
        runQuery: mockRunQuery,
        checkConnection: mockCheckConnection,
        listDatabases: mockListDbs,
      });

      await listDatabases("postgresql", pgCreds);
      expect(mockCreateConnectionModule).toHaveBeenCalledWith(
        "postgresql",
        expect.objectContaining({ username: "postgres" }),
        expect.anything(),
      );
    });
  });

  // -----------------------------------------------------------------------
  // listSchemas
  // -----------------------------------------------------------------------

  describe("listSchemas", () => {
    let listSchemas: typeof import("@/lib/query/query-executor").listSchemas;

    beforeEach(async () => {
      vi.clearAllMocks();
      vi.resetModules();
      vi.doMock("../connection-adapter", () => ({
        createConnectionModule: mockCreateConnectionModule,
        DEFAULT_CONNECTION_CONFIG: { connectionTimeout: 30000, timeout: 30000 },
        ConnectionTypes: { NEO4J: 1, POSTGRESQL: 2 },
      }));
      const mod = await import("@/lib/query/query-executor");
      listSchemas = mod.listSchemas;
    });

    it("returns schemas when module supports listSchemas", async () => {
      const mockListSch = vi.fn().mockResolvedValue(["public", "analytics"]);
      mockCreateConnectionModule.mockReturnValue({
        runQuery: mockRunQuery,
        checkConnection: mockCheckConnection,
        listSchemas: mockListSch,
      });

      const result = await listSchemas("postgresql", pgCreds);
      expect(result).toEqual(["public", "analytics"]);
    });

    it("returns empty array when module does not support listSchemas", async () => {
      mockCreateConnectionModule.mockReturnValue({
        runQuery: mockRunQuery,
        checkConnection: mockCheckConnection,
        // no listSchemas method
      });

      const result = await listSchemas("neo4j", neo4jCreds);
      expect(result).toEqual([]);
    });
  });
});
