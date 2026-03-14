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

vi.mock("../connection-adapter", () => ({
  createConnectionModule: mockCreateConnectionModule,
  DEFAULT_CONNECTION_CONFIG: { connectionTimeout: 30000, timeout: 30000 },
  ConnectionTypes: { NEO4J: 1, POSTGRESQL: 2 },
}));

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("query-executor", () => {
  let executeQuery: typeof import("../query-executor").executeQuery;
  let testConnection: typeof import("../query-executor").testConnection;

  beforeEach(async () => {
    vi.clearAllMocks();
    vi.resetModules();
    vi.doMock("../connection-adapter", () => ({
      createConnectionModule: mockCreateConnectionModule,
      DEFAULT_CONNECTION_CONFIG: { connectionTimeout: 30000, timeout: 30000 },
      ConnectionTypes: { NEO4J: 1, POSTGRESQL: 2 },
    }));
    const mod = await import("../query-executor");
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

  it("creates a connection module and resolves on onSuccess", async () => {
    mockRunQuery.mockImplementation(
      (_p: unknown, cbs: { onSuccess: (v: unknown) => void }) => {
        cbs.onSuccess([{ n: 1 }]);
      }
    );

    const result = await executeQuery("neo4j", neo4jCreds, { query: "RETURN 1 AS n" });
    expect(mockCreateConnectionModule).toHaveBeenCalledWith(
      1, // NEO4J
      expect.objectContaining({ uri: neo4jCreds.uri, username: "neo4j" }),
      expect.any(Object),
    );
    expect(result).toEqual({ data: [{ n: 1 }] });
  });

  it("rejects when runQuery calls onFail", async () => {
    mockRunQuery.mockImplementation(
      (_p: unknown, cbs: { onFail: (v: unknown) => void }) => {
        cbs.onFail(new Error("Connection refused"));
      }
    );

    await expect(
      executeQuery("neo4j", neo4jCreds, { query: "RETURN 1" })
    ).rejects.toThrow("Connection refused");
  });

  // -----------------------------------------------------------------------
  // executeQuery — connection type mapping
  // -----------------------------------------------------------------------

  it("uses POSTGRESQL type for postgresql", async () => {
    mockRunQuery.mockImplementation(
      (_p: unknown, cbs: { onSuccess: (v: unknown) => void }) => {
        cbs.onSuccess([]);
      }
    );

    await executeQuery("postgresql", pgCreds, { query: "SELECT 1" });
    expect(mockCreateConnectionModule).toHaveBeenCalledWith(
      2, // POSTGRESQL
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
      (_p: unknown, cbs: { onSuccess: (v: unknown) => void }, config: Record<string, unknown>) => {
        capturedConfig = config;
        cbs.onSuccess([]);
      }
    );

    await executeQuery("neo4j", neo4jCreds, { query: "CREATE (n)" }, { accessMode: "WRITE" });
    expect(capturedConfig.accessMode).toBe("WRITE");
  });

  it("passes queryTimeout and connectionTimeout overrides", async () => {
    let capturedConfig: Record<string, unknown> = {};
    mockRunQuery.mockImplementation(
      (_p: unknown, cbs: { onSuccess: (v: unknown) => void }, config: Record<string, unknown>) => {
        capturedConfig = config;
        cbs.onSuccess([]);
      }
    );

    const creds = { ...neo4jCreds, queryTimeout: 5000, connectionTimeout: 3000 };
    await executeQuery("neo4j", creds, { query: "RETURN 1" });
    expect(capturedConfig.timeout).toBe(5000);
    expect(capturedConfig.connectionTimeout).toBe(3000);
  });

  it("spreads DEFAULT_CONNECTION_CONFIG into query config", async () => {
    let capturedConfig: Record<string, unknown> = {};
    mockRunQuery.mockImplementation(
      (_p: unknown, cbs: { onSuccess: (v: unknown) => void }, config: Record<string, unknown>) => {
        capturedConfig = config;
        cbs.onSuccess([]);
      }
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
      }
    );

    await executeQuery("postgresql", pgCreds, {
      query: "SELECT * FROM t WHERE name = $param_name",
      params: { param_name: "Alice" },
    });

    const params = capturedParams as { query: string; params: Record<string, unknown> };
    expect(params.query).toContain("$1");
    expect(params.query).not.toContain("$param_name");
  });

  it("does NOT rewrite params for neo4j queries", async () => {
    let capturedParams: unknown = null;
    mockRunQuery.mockImplementation(
      (p: unknown, cbs: { onSuccess: (v: unknown) => void }) => {
        capturedParams = p;
        cbs.onSuccess([]);
      }
    );

    await executeQuery("neo4j", neo4jCreds, {
      query: "MATCH (n {name: $param_name}) RETURN n",
      params: { param_name: "Alice" },
    });

    const params = capturedParams as { query: string; params: Record<string, unknown> };
    expect(params.query).toContain("$param_name");
  });

  // -----------------------------------------------------------------------
  // executeQuery — advanced options
  // -----------------------------------------------------------------------

  it("passes advanced options to createConnectionModule", async () => {
    mockRunQuery.mockImplementation(
      (_p: unknown, cbs: { onSuccess: (v: unknown) => void }) => {
        cbs.onSuccess([]);
      }
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
      1,
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
      }
    );

    await executeQuery("neo4j", neo4jCreds, { query: "RETURN 1" });
    await executeQuery("neo4j", neo4jCreds, { query: "RETURN 2" });
    expect(mockCreateConnectionModule).toHaveBeenCalledTimes(1);
  });

  it("creates new module for different credentials", async () => {
    mockRunQuery.mockImplementation(
      (_p: unknown, cbs: { onSuccess: (v: unknown) => void }) => {
        cbs.onSuccess([]);
      }
    );

    await executeQuery("neo4j", neo4jCreds, { query: "RETURN 1" });
    await executeQuery("neo4j", { ...neo4jCreds, uri: "bolt://other:7687" }, { query: "RETURN 2" });
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
});
