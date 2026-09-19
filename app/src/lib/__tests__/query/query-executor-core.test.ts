import { describe, it, expect, vi, beforeEach } from "vitest";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockRunQuery = vi.fn();
const mockCheckConnection = vi.fn();
const mockClose = vi.fn().mockResolvedValue(undefined);
const mockListDatabases = vi.fn();
const mockListSchemas = vi.fn();
/**
 * The module every test gets unless it says otherwise.
 *
 * Reinstalled per test rather than relied on: `clearAllMocks` clears calls,
 * not implementations, so a `mockReturnValue` installed by one test decides
 * every later one. The "does not support listSchemas" case below did exactly
 * that — after it ran, every connector in the file reported no schema support
 * and the positive case tested nothing (#1630).
 */
const defaultModule = () => ({
  runQuery: mockRunQuery,
  checkConnection: mockCheckConnection,
  close: mockClose,
  listDatabases: mockListDatabases,
  listSchemas: mockListSchemas as ((...args: unknown[]) => unknown) | undefined,
});

const mockCreateConnectionModule = vi.fn(defaultModule);

vi.mock("@/lib/connector/connection-adapter", () => ({
  createConnectionModule: mockCreateConnectionModule,
  DEFAULT_CONNECTION_CONFIG: { connectionTimeout: 30000, timeout: 30000 },
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
  let closeConnection: typeof import("@/lib/query/query-executor").closeConnection;
  let closeAllConnections: typeof import("@/lib/query/query-executor").closeAllConnections;
  let _getCacheSize: typeof import("@/lib/query/query-executor")._getCacheSize;
  let _getCacheKeysForTesting: typeof import("@/lib/query/query-executor")._getCacheKeysForTesting;
  let _evictStaleEntries: typeof import("@/lib/query/query-executor")._evictStaleEntries;

  beforeEach(async () => {
    vi.clearAllMocks();
    vi.resetModules();
    vi.doMock("../connection-adapter", () => ({
      createConnectionModule: mockCreateConnectionModule,
      DEFAULT_CONNECTION_CONFIG: { connectionTimeout: 30000, timeout: 30000 },
    }));
    const mod = await import("@/lib/query/query-executor");
    executeQuery = mod.executeQuery;
    testConnection = mod.testConnection;
    closeConnection = mod.closeConnection;
    closeAllConnections = mod.closeAllConnections;
    _getCacheSize = mod._getCacheSize;
    _getCacheKeysForTesting = mod._getCacheKeysForTesting;
    _evictStaleEntries = mod._evictStaleEntries;
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
    // ONE config bag (#1897): the decrypted config, as stored.
    expect(mockCreateConnectionModule).toHaveBeenCalledWith(
      "neo4j", // string type for registry
      neo4jCreds,
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

  it("maps a registry-supplied connector type to its module (#1121)", async () => {
    mockRunQuery.mockImplementation(
      (_p: unknown, cbs: { onSuccess: (v: unknown) => void }) => {
        cbs.onSuccess([{ x: 1 }]);
      },
    );

    // A type that isn't a built-in — the executor must still resolve its
    // module through the registry (createConnectionModule), no per-type branch.
    await executeQuery("mysql", pgCreds, { query: "SELECT 1" });

    expect(mockCreateConnectionModule).toHaveBeenCalledWith("mysql", pgCreds);
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
  // executeQuery — per-request rowLimit (#1896)
  // -----------------------------------------------------------------------

  it.each([
    { maxRows: undefined, requested: 25, effective: 25 },
    { maxRows: 1000, requested: 25, effective: 25 },
    { maxRows: undefined, requested: 5001, effective: 5000 },
    { maxRows: 1000, requested: 100_000, effective: 1000 },
    { maxRows: 1000, requested: 1000, effective: 1000 },
  ])(
    "a requested rowLimit of $requested on maxRows $maxRows runs at $effective: it lowers the cap, never raises it",
    async ({ maxRows, requested, effective }) => {
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

      const result = await executeQuery(
        "postgresql",
        { ...pgCreds, maxRows },
        { query: "SELECT 1" },
        { rowLimit: requested },
      );

      expect(capturedConfig.rowLimit).toBe(effective);
      expect(result.rowLimit).toBe(effective);
    },
  );

  it("sends the query text to the connector untouched whatever the rowLimit", async () => {
    let capturedParams: unknown;
    mockRunQuery.mockImplementation(
      (p: unknown, cbs: { onSuccess: (v: unknown) => void }) => {
        capturedParams = p;
        cbs.onSuccess([]);
      },
    );
    const query = "MATCH (n) RETURN n ORDER BY n.name;";

    await executeQuery("neo4j", neo4jCreds, { query }, { rowLimit: 25 });

    expect(capturedParams).toEqual({ query });
  });

  it("a rowLimit is per query: it reuses the connection's pooled module", async () => {
    mockRunQuery.mockImplementation(
      (_p: unknown, cbs: { onSuccess: (v: unknown) => void }) =>
        cbs.onSuccess([]),
    );

    await executeQuery("postgresql", pgCreds, { query: "SELECT 1" });
    await executeQuery(
      "postgresql",
      pgCreds,
      { query: "SELECT 1" },
      { rowLimit: 25 },
    );

    expect(mockCreateConnectionModule).toHaveBeenCalledTimes(1);
  });

  // -----------------------------------------------------------------------
  // executeQuery — the timeout is the connector's to resolve (#1898)
  //
  // The app used to pick `statementTimeout ?? queryTimeout` for one connector
  // type and `queryTimeout` for the rest, so it knew which connector it was
  // talking to and which stored key was whose. Each connector now reads the
  // timeout field IT declares from its own bag; the app sets config.timeout
  // only for an explicit per-query override.
  // -----------------------------------------------------------------------

  function captureConfig(): () => Record<string, unknown> {
    let captured: Record<string, unknown> = {};
    mockRunQuery.mockImplementation(
      (
        _p: unknown,
        cbs: { onSuccess: (v: unknown) => void },
        config: Record<string, unknown>,
      ) => {
        captured = config;
        cbs.onSuccess([]);
      },
    );
    return () => captured;
  }

  /** Every connector type goes down the same path; the last is not a built-in. */
  const ANY_TYPE = ["neo4j", "postgresql", "fixture-db"];

  it.each(ANY_TYPE)(
    "%s: leaves config.timeout unset whatever timeout keys the bag holds",
    async (type) => {
      const get = captureConfig();
      await executeQuery(
        type,
        { ...pgCreds, statementTimeout: 12_345, queryTimeout: 99_999 },
        { query: "SELECT 1" },
      );
      // Not the package default either: a 30s here would outrank the
      // connector's own configured timeout.
      expect(get().timeout).toBeUndefined();
    },
  );

  it.each(ANY_TYPE)(
    "%s: passes an explicit per-query timeout override",
    async (type) => {
      const get = captureConfig();
      await executeQuery(
        type,
        { ...pgCreds, statementTimeout: 12_345, queryTimeout: 99_999 },
        { query: "SELECT 1" },
        { timeout: 777 },
      );
      expect(get().timeout).toBe(777);
    },
  );

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
      pgCreds,
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

  it("passes a connectionTimeout override", async () => {
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

    const creds = { ...neo4jCreds, connectionTimeout: 3000 };
    await executeQuery("neo4j", creds, { query: "RETURN 1" });
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
  // executeQuery — named parameters, for every connector (#1898)
  //
  // The app used to rewrite `$param_x` into positional `$1` for one connector
  // type. Parameter style is the connector's business: the app hands over the
  // query text and the named map exactly as it received them.
  // -----------------------------------------------------------------------

  it.each(ANY_TYPE)(
    "%s: hands the query text and the named params through untouched",
    async (type) => {
      let captured: unknown = null;
      mockRunQuery.mockImplementation(
        (p: unknown, cbs: { onSuccess: (v: unknown) => void }) => {
          captured = p;
          cbs.onSuccess([]);
        },
      );
      const queryParams = {
        query: "SELECT * FROM t WHERE name = $param_name AND id = $1",
        params: { param_name: "Alice" },
      };

      await executeQuery(type, pgCreds, queryParams);

      expect(captured).toBe(queryParams);
    },
  );

  it("treats every connector type alike: same query, same per-query config", async () => {
    const seen: unknown[][] = [];
    mockRunQuery.mockImplementation(
      (
        p: unknown,
        cbs: { onSuccess: (v: unknown) => void },
        config: unknown,
      ) => {
        seen.push([p, config]);
        cbs.onSuccess([]);
      },
    );
    const bag = { ...pgCreds, statementTimeout: 12_345, queryTimeout: 99_999 };

    for (const type of ANY_TYPE) {
      await executeQuery(
        type,
        bag,
        { query: "SELECT $param_x", params: {} },
        { accessMode: "READ", rowLimit: 25 },
      );
    }

    expect(seen).toHaveLength(3);
    expect(seen[1]).toEqual(seen[0]);
    expect(seen[2]).toEqual(seen[0]);
  });

  // -----------------------------------------------------------------------
  // The config bag passes through (#1897)
  //
  // The app used to translate the stored config into an auth object plus a
  // bag of connector-prefixed options (neo4jMaxPoolSize, pgMaxPoolSize, …), so
  // it had to know every option of every connector. Now it hands the decrypted
  // config over as it is and the connector reads its own keys.
  // -----------------------------------------------------------------------

  describe("config pass-through", () => {
    const ok = () =>
      mockRunQuery.mockImplementation(
        (_p: unknown, cbs: { onSuccess: (v: unknown) => void }) => {
          cbs.onSuccess([]);
        },
      );

    it("hands the connector every stored key, unrenamed and unprefixed", async () => {
      ok();
      const creds = {
        ...pgCreds,
        connectionTimeout: 5000,
        queryTimeout: 10000,
        maxPoolSize: 20,
        idleTimeout: 15000,
        statementTimeout: 60000,
        sslRejectUnauthorized: false,
        maxRows: 250,
      };

      await executeQuery("postgresql", creds, { query: "SELECT 1" });

      expect(mockCreateConnectionModule).toHaveBeenCalledTimes(1);
      expect(mockCreateConnectionModule.mock.calls[0]).toEqual([
        "postgresql",
        creds,
      ]);
    });

    it("passes keys it has never heard of — a new connector option needs no app change", async () => {
      ok();
      const creds = { ...neo4jCreds, region: "eu-west-1", tls: { pin: "abc" } };

      await executeQuery("fixture-db", creds, { query: "anything" });

      expect(mockCreateConnectionModule.mock.calls[0]).toEqual([
        "fixture-db",
        creds,
      ]);
    });

    it("adds nothing: no authType, no prefixed options, no patched URI", async () => {
      ok();
      await executeQuery(
        "postgresql",
        { ...pgCreds, uri: "postgresql://localhost:5432", database: "sales" },
        { query: "SELECT 1" },
      );

      const [, config] = mockCreateConnectionModule.mock
        .calls[0] as unknown as [string, Record<string, unknown>];
      // The connector applies `database` itself now; the URI is as typed.
      expect(config.uri).toBe("postgresql://localhost:5432");
      expect(config.database).toBe("sales");
      expect(Object.keys(config).sort()).toEqual(
        ["database", "password", "uri", "username"].sort(),
      );
    });

    it("does not mutate the caller's credentials", async () => {
      ok();
      const creds = { ...pgCreds };
      await executeQuery("postgresql", creds, { query: "SELECT 1" });
      expect(creds).toEqual(pgCreds);
    });

    it("rewrites only the bag's uri for a containerised deployment", async () => {
      // Deployment logic, not connector logic, so it stays in the app (#1346):
      // the driver sees the rewritten host, the stored config keeps what the
      // user typed, and every other key passes through untouched.
      vi.resetModules();
      vi.doMock("@/lib/connector/container-host", () => ({
        resolveContainerHost: async (uri: string) =>
          uri.replace("localhost", "host.docker.internal"),
      }));
      try {
        const mod = await import("@/lib/query/query-executor");
        ok();
        const creds = { ...pgCreds, maxPoolSize: 7 };

        await mod.executeQuery("postgresql", creds, { query: "SELECT 1" });

        expect(mockCreateConnectionModule.mock.calls[0]).toEqual([
          "postgresql",
          { ...creds, uri: "postgresql://host.docker.internal:5432/testdb" },
        ]);
        expect(creds.uri).toBe(pgCreds.uri);
      } finally {
        vi.doUnmock("@/lib/connector/container-host");
      }
    });

    it("leaves a bag with no uri alone — not every connector has one", async () => {
      ok();
      const creds = { apiToken: "tok" } as unknown as typeof neo4jCreds;
      await executeQuery("fixture-api", creds, { query: "anything" });
      expect(mockCreateConnectionModule.mock.calls[0]).toEqual([
        "fixture-api",
        { apiToken: "tok" },
      ]);
    });

    it("sends no connectionType in the per-query config", async () => {
      const get = captureConfig();
      await executeQuery("neo4j", neo4jCreds, { query: "RETURN 1" });
      expect(get()).not.toHaveProperty("connectionType");
    });
  });

  // -----------------------------------------------------------------------
  // Cache key — a digest of the WHOLE bag (#1897)
  //
  // The key used to enumerate eight known fields, so a connector option the
  // app had not heard of was not part of it: two connections differing only in
  // that option shared one driver, silently.
  // -----------------------------------------------------------------------

  describe("cache key", () => {
    const ok = () =>
      mockRunQuery.mockImplementation(
        (_p: unknown, cbs: { onSuccess: (v: unknown) => void }) => {
          cbs.onSuccess([]);
        },
      );

    const full = {
      uri: "postgresql://db.internal:5432/app",
      // Not "postgres": the key starts with the type, "postgresql|…".
      username: "svc_reader",
      password: "password",
      database: "sales",
      connectionTimeout: 5000,
      queryTimeout: 10000,
      maxPoolSize: 20,
      connectionAcquisitionTimeout: 8000,
      idleTimeout: 15000,
      statementTimeout: 60000,
      sslRejectUnauthorized: false,
      maxRows: 250,
      // Not in ConnectionCredentials: an option only some connector knows.
      region: "eu-west-1",
    };

    const changed: Record<keyof typeof full, unknown> = {
      uri: "postgresql://db.internal:5433/app",
      username: "other",
      password: "other-password",
      database: "other",
      connectionTimeout: 5001,
      queryTimeout: 10001,
      maxPoolSize: 21,
      connectionAcquisitionTimeout: 8001,
      idleTimeout: 15001,
      statementTimeout: 60001,
      sslRejectUnauthorized: true,
      maxRows: 251,
      region: "us-east-1",
    };

    it.each(Object.keys(full) as (keyof typeof full)[])(
      "changes when %s changes",
      async (key) => {
        ok();
        await executeQuery("postgresql", full, { query: "SELECT 1" });
        await executeQuery(
          "postgresql",
          { ...full, [key]: changed[key] },
          { query: "SELECT 1" },
        );
        expect(_getCacheSize()).toBe(2);
        expect(mockCreateConnectionModule).toHaveBeenCalledTimes(2);
      },
    );

    it("changes when a key is added or removed", async () => {
      ok();
      const { region: _region, ...without } = full;
      await executeQuery("postgresql", full, { query: "SELECT 1" });
      await executeQuery("postgresql", without, { query: "SELECT 1" });
      expect(_getCacheSize()).toBe(2);
    });

    it("changes with the connector type", async () => {
      ok();
      await executeQuery("postgresql", full, { query: "SELECT 1" });
      await executeQuery("fixture-db", full, { query: "SELECT 1" });
      expect(_getCacheSize()).toBe(2);
    });

    it("is stable under key reordering, at any depth", async () => {
      ok();
      const nested = { ...full, tls: { pin: "abc", mode: "strict" } };
      const reordered = {
        tls: { mode: "strict", pin: "abc" },
        ...Object.fromEntries(Object.entries(full).reverse()),
      } as typeof nested;

      await executeQuery("postgresql", nested, { query: "SELECT 1" });
      await executeQuery("postgresql", reordered, { query: "SELECT 1" });

      expect(_getCacheSize()).toBe(1);
      expect(mockCreateConnectionModule).toHaveBeenCalledTimes(1);
    });

    it("treats an undefined value as an absent key", async () => {
      // JSON drops undefined, so a config read back from storage never has
      // one; a caller that spells it out must still hit the same driver.
      ok();
      await executeQuery("neo4j", neo4jCreds, { query: "RETURN 1" });
      await executeQuery(
        "neo4j",
        { ...neo4jCreds, database: undefined, maxRows: undefined },
        { query: "RETURN 1" },
      );
      expect(_getCacheSize()).toBe(1);
    });

    it("does not confuse a value with its string form", async () => {
      ok();
      await executeQuery("neo4j", neo4jCreds, { query: "RETURN 1" });
      await executeQuery(
        "neo4j",
        { ...neo4jCreds, maxPoolSize: 5 },
        { query: "RETURN 1" },
      );
      await executeQuery(
        "neo4j",
        { ...neo4jCreds, maxPoolSize: "5" as unknown as number },
        { query: "RETURN 1" },
      );
      expect(_getCacheSize()).toBe(3);
    });

    it("is an opaque digest: no config value can be read out of it", async () => {
      ok();
      await executeQuery("postgresql", full, { query: "SELECT 1" });

      const [key] = _getCacheKeysForTesting();
      expect(key).toMatch(/^postgresql\|[0-9a-f]{64}$/);
      const strings = Object.values(full).filter(
        (value): value is string => typeof value === "string",
      );
      for (const value of strings) expect(key).not.toContain(value);
    });

    it("a per-query rowLimit shares the driver, stays out of the bag, and is still clamped (#1896)", async () => {
      // The two changes meet here: the row limit is a property of ONE query,
      // so it must not split the module cache or reach the connector's config
      // bag — and the clamp must survive the pass-through: a request can lower
      // the connection's cap, never raise it.
      const get = captureConfig();
      const creds = { ...neo4jCreds, maxRows: 100 };

      const preview = await executeQuery(
        "neo4j",
        creds,
        { query: "RETURN 1" },
        { rowLimit: 25 },
      );
      expect(get().rowLimit).toBe(25);
      expect(preview.rowLimit).toBe(25);

      const greedy = await executeQuery(
        "neo4j",
        creds,
        { query: "RETURN 1" },
        { rowLimit: 5000 },
      );
      expect(get().rowLimit).toBe(100);
      expect(greedy.rowLimit).toBe(100);

      expect(_getCacheSize()).toBe(1);
      expect(mockCreateConnectionModule.mock.calls).toEqual([["neo4j", creds]]);
    });

    it("closeConnection finds the module by the same key", async () => {
      ok();
      await executeQuery("postgresql", full, { query: "SELECT 1" });
      closeConnection("postgresql", { ...full });
      expect(_getCacheSize()).toBe(0);
    });
  });

  // -----------------------------------------------------------------------
  // Nothing logs the config bag
  // -----------------------------------------------------------------------

  describe("the config bag is never logged", () => {
    const SECRET = "s3ntinel-p4ssw0rd";
    const HOST = "sentinel-host.internal";
    const creds = {
      uri: `bolt://${HOST}:7687`,
      username: "sentinel-user",
      password: SECRET,
      apiToken: "sentinel-token",
    };
    const methods = ["log", "info", "warn", "error", "debug", "trace"] as const;

    it("on success, failure, test, list and close — no console call sees it", async () => {
      const spies = methods.map((m) =>
        vi.spyOn(console, m).mockImplementation(() => {}),
      );
      try {
        mockRunQuery.mockImplementationOnce(
          (_p: unknown, cbs: { onSuccess: (v: unknown) => void }) =>
            cbs.onSuccess([]),
        );
        await executeQuery("neo4j", creds, { query: "RETURN 1" });

        mockRunQuery.mockImplementationOnce(
          (_p: unknown, cbs: { onFail: (e: unknown) => void }) =>
            cbs.onFail(new Error("boom")),
        );
        await expect(
          executeQuery("neo4j", creds, { query: "RETURN 1" }),
        ).rejects.toThrow("boom");

        mockCheckConnection.mockRejectedValueOnce(new Error("down"));
        await expect(testConnection("neo4j", creds)).rejects.toThrow("down");

        mockCreateConnectionModule.mockImplementationOnce(() => {
          throw new Error("driver refused the config");
        });
        await expect(
          executeQuery(
            "neo4j",
            { ...creds, username: "second" },
            {
              query: "RETURN 1",
            },
          ),
        ).rejects.toThrow("driver refused the config");

        closeConnection("neo4j", creds);
        await closeAllConnections();
        _evictStaleEntries();

        const logged = JSON.stringify(spies.flatMap((spy) => spy.mock.calls));
        for (const value of Object.values(creds)) {
          expect(logged).not.toContain(value);
        }
        expect(logged).not.toContain(HOST);
      } finally {
        spies.forEach((spy) => spy.mockRestore());
      }
    });
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
      expect.objectContaining({ connectionTimeout: 30000 }),
    );
    // The numeric connection-type enum is gone (#1897) — no module read it.
    expect(mockCheckConnection.mock.calls[0][0]).not.toHaveProperty(
      "connectionType",
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
  // Cache eviction
  // -----------------------------------------------------------------------

  it("closeConnection removes a cached module and calls close()", async () => {
    mockRunQuery.mockImplementation(
      (_p: unknown, cbs: { onSuccess: (v: unknown) => void }) => {
        cbs.onSuccess([]);
      },
    );

    await executeQuery("neo4j", neo4jCreds, { query: "RETURN 1" });
    expect(_getCacheSize()).toBe(1);

    closeConnection("neo4j", neo4jCreds);
    expect(_getCacheSize()).toBe(0);
    expect(mockClose).toHaveBeenCalledTimes(1);
  });

  it("does not reuse a cached module when only the password differs (#1300)", async () => {
    mockRunQuery.mockImplementation(
      (_p: unknown, cbs: { onSuccess: (v: unknown) => void }) => {
        cbs.onSuccess([]);
      },
    );

    // Same host, same user, DIFFERENT password. Keying without the password
    // meant the second caller was handed the pool the first caller had already
    // authenticated — so a wrong password still got a working connection.
    await executeQuery("neo4j", neo4jCreds, { query: "RETURN 1" });
    await executeQuery(
      "neo4j",
      { ...neo4jCreds, password: "a-different-password" },
      { query: "RETURN 1" },
    );

    expect(_getCacheSize()).toBe(2);
    expect(mockCreateConnectionModule).toHaveBeenCalledTimes(2);
  });

  it("keeps the raw password out of the cache key (#1300)", async () => {
    mockRunQuery.mockImplementation(
      (_p: unknown, cbs: { onSuccess: (v: unknown) => void }) => {
        cbs.onSuccess([]);
      },
    );

    await executeQuery(
      "neo4j",
      { ...neo4jCreds, password: "sup3r-s3cret-value" },
      { query: "RETURN 1" },
    );

    // Cache keys land in diagnostics and error paths; a credential must never
    // be recoverable from one. Only a digest of it may appear.
    const keys = _getCacheKeysForTesting();
    expect(keys).toHaveLength(1);
    expect(keys[0]).not.toContain("sup3r-s3cret-value");
  });

  it("closeConnection is a no-op for unknown keys", () => {
    closeConnection("neo4j", neo4jCreds);
    expect(_getCacheSize()).toBe(0);
  });

  it("closeAllConnections clears the entire cache", async () => {
    mockRunQuery.mockImplementation(
      (_p: unknown, cbs: { onSuccess: (v: unknown) => void }) => {
        cbs.onSuccess([]);
      },
    );

    await executeQuery("neo4j", neo4jCreds, { query: "RETURN 1" });
    await executeQuery("postgresql", pgCreds, { query: "SELECT 1" });
    expect(_getCacheSize()).toBe(2);

    await closeAllConnections();
    expect(_getCacheSize()).toBe(0);
  });

  it("closeAllConnections calls close() on each module", async () => {
    mockRunQuery.mockImplementation(
      (_p: unknown, cbs: { onSuccess: (v: unknown) => void }) => {
        cbs.onSuccess([]);
      },
    );

    await executeQuery("neo4j", neo4jCreds, { query: "RETURN 1" });
    await executeQuery("postgresql", pgCreds, { query: "SELECT 1" });
    mockClose.mockClear();

    await closeAllConnections();
    expect(mockClose).toHaveBeenCalledTimes(2);
  });

  it("closeConnection handles close() rejection gracefully", async () => {
    mockClose.mockRejectedValueOnce(new Error("close failed"));
    mockRunQuery.mockImplementation(
      (_p: unknown, cbs: { onSuccess: (v: unknown) => void }) => {
        cbs.onSuccess([]);
      },
    );

    await executeQuery("neo4j", neo4jCreds, { query: "RETURN 1" });
    expect(() => closeConnection("neo4j", neo4jCreds)).not.toThrow();
    expect(_getCacheSize()).toBe(0);
  });

  it("cache refreshes lastAccessedAt on reuse", async () => {
    mockRunQuery.mockImplementation(
      (_p: unknown, cbs: { onSuccess: (v: unknown) => void }) => {
        cbs.onSuccess([]);
      },
    );

    await executeQuery("neo4j", neo4jCreds, { query: "RETURN 1" });
    expect(mockCreateConnectionModule).toHaveBeenCalledTimes(1);

    await executeQuery("neo4j", neo4jCreds, { query: "RETURN 2" });
    expect(mockCreateConnectionModule).toHaveBeenCalledTimes(1);
    expect(_getCacheSize()).toBe(1);
  });

  it("_evictStaleEntries is a no-op when cache is empty", () => {
    expect(() => _evictStaleEntries()).not.toThrow();
    expect(_getCacheSize()).toBe(0);
  });

  it("_evictStaleEntries keeps entries that are within TTL", async () => {
    mockRunQuery.mockImplementation(
      (_p: unknown, cbs: { onSuccess: (v: unknown) => void }) => {
        cbs.onSuccess([]);
      },
    );

    await executeQuery("neo4j", neo4jCreds, { query: "RETURN 1" });
    expect(_getCacheSize()).toBe(1);

    // Immediately after creation — well within TTL
    _evictStaleEntries();
    expect(_getCacheSize()).toBe(1);
    expect(mockClose).not.toHaveBeenCalled();
  });

  it("_evictStaleEntries removes entries past TTL", async () => {
    vi.useFakeTimers();
    const baseTime = Date.now();
    vi.setSystemTime(baseTime);

    mockRunQuery.mockImplementation(
      (_p: unknown, cbs: { onSuccess: (v: unknown) => void }) => {
        cbs.onSuccess([]);
      },
    );

    await executeQuery("neo4j", neo4jCreds, { query: "RETURN 1" });
    expect(_getCacheSize()).toBe(1);

    // Advance past 30min TTL
    vi.setSystemTime(baseTime + 31 * 60 * 1000);
    _evictStaleEntries();

    expect(_getCacheSize()).toBe(0);
    expect(mockClose).toHaveBeenCalledTimes(1);
    vi.useRealTimers();
  });

  it("_evictStaleEntries handles close() rejection", async () => {
    vi.useFakeTimers();
    const baseTime = Date.now();
    vi.setSystemTime(baseTime);

    mockClose.mockRejectedValueOnce(new Error("close failed"));
    mockRunQuery.mockImplementation(
      (_p: unknown, cbs: { onSuccess: (v: unknown) => void }) => {
        cbs.onSuccess([]);
      },
    );

    await executeQuery("neo4j", neo4jCreds, { query: "RETURN 1" });
    vi.setSystemTime(baseTime + 31 * 60 * 1000);

    expect(() => _evictStaleEntries()).not.toThrow();
    expect(_getCacheSize()).toBe(0);
    vi.useRealTimers();
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
      }));
      const mod = await import("@/lib/query/query-executor");
      listDatabases = mod.listDatabases;
    });

    it("returns databases from the connection module", async () => {
      mockListDatabases.mockResolvedValue(["neo4j", "movies"]);

      const result = await listDatabases("neo4j", neo4jCreds);
      expect(result).toEqual(["neo4j", "movies"]);
      expect(mockListDatabases).toHaveBeenCalled();
    });

    it("creates module with correct credentials", async () => {
      mockListDatabases.mockResolvedValue([]);

      await listDatabases("postgresql", pgCreds);
      expect(mockCreateConnectionModule).toHaveBeenCalledWith(
        "postgresql",
        pgCreds,
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
      }));
      const mod = await import("@/lib/query/query-executor");
      listSchemas = mod.listSchemas;
    });

    it("returns schemas when module supports listSchemas", async () => {
      mockListSchemas.mockResolvedValue(["public", "analytics"]);

      const result = await listSchemas("postgresql", pgCreds);
      expect(result).toEqual(["public", "analytics"]);
    });

    it("returns empty array when module does not support listSchemas", async () => {
      // Scoped to this test: `mockReturnValueOnce` is consumed by the single
      // createConnectionModule call listSchemas makes, so it cannot outlive it.
      mockCreateConnectionModule.mockReturnValueOnce({
        runQuery: mockRunQuery,
        checkConnection: mockCheckConnection,
        close: mockClose,
        listDatabases: mockListDatabases,
        listSchemas: undefined,
      });

      const result = await listSchemas("neo4j", neo4jCreds);
      expect(result).toEqual([]);
    });
  });

  // -----------------------------------------------------------------------
  // executeQuery — runQuery rejection backstop (#1642)
  // -----------------------------------------------------------------------
  describe("runQuery rejection backstop (#1642)", () => {
    it("rejects with the connector's own rejection instead of hanging", async () => {
      // A connector rejects runQuery only when the consumer's onSuccess threw.
      // executeQuery's onSuccess is a bare resolve() and cannot, but the
      // promise it wraps must still settle if the contract is ever exercised —
      // before #1642 it was dropped, and this test would never return.
      const bug = new Error("consumer handler blew up");
      mockRunQuery.mockImplementation(() => Promise.reject(bug));

      await expect(
        executeQuery("neo4j", neo4jCreds, { query: "RETURN 1" }),
      ).rejects.toBe(bug);
    });

    it("still resolves when the stubbed runQuery returns nothing at all", async () => {
      // Every other stub in this file is a block-bodied arrow returning
      // undefined; the backstop must tolerate that, not throw on `.catch`.
      mockRunQuery.mockImplementation(
        (_p: unknown, cbs: { onSuccess: (v: unknown) => void }) => {
          cbs.onSuccess([{ ok: 1 }]);
        },
      );

      await expect(
        executeQuery("neo4j", neo4jCreds, { query: "RETURN 1" }),
      ).resolves.toMatchObject({ data: [{ ok: 1 }] });
    });
  });
});
