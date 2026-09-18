import type { ConnectorConfig } from "@neoboard/connector-sdk";

// Since #1897 a connector is built from ONE config bag — the connection's
// stored config, keyed by the descriptor's field keys. These tests pin what
// each built-in does with that bag: which keys it reads, the defaults it
// applies when a key is absent, and what reaches the driver. No database:
// neo4j.driver() and pg.Pool are mocked and their arguments captured.

// ---------------------------------------------------------------------------
// Mocks — capture constructor args for neo4j.driver() and pg.Pool
// ---------------------------------------------------------------------------

const mockNeo4jDriverFn = jest.fn().mockReturnValue({
  verifyAuthentication: jest.fn().mockResolvedValue(true),
  close: jest.fn().mockResolvedValue(undefined),
  session: jest.fn(),
});

jest.mock("neo4j-driver", () => ({
  __esModule: true,
  default: {
    driver: mockNeo4jDriverFn,
    auth: {
      basic: jest.fn((u: string, p: string) => ({
        principal: u,
        credentials: p,
      })),
    },
  },
}));

// Track Pool constructor calls for assertions
const poolConstructorCalls: Record<string, unknown>[] = [];
const mockPoolInstance = {
  connect: jest.fn(),
  end: jest.fn().mockResolvedValue(undefined),
  on: jest.fn(),
  removeAllListeners: jest.fn(),
};

jest.mock("pg", () => ({
  Pool: jest.fn().mockImplementation((config: Record<string, unknown>) => {
    poolConstructorCalls.push(config);
    return mockPoolInstance;
  }),
}));

// ---------------------------------------------------------------------------
// Shared fixtures — the bag as the app stores it: no authType, no prefixes.
// ---------------------------------------------------------------------------

const neo4jConfig: ConnectorConfig = {
  uri: "bolt://localhost:7687",
  username: "neo4j",
  password: "test",
};

const pgConfig: ConnectorConfig = {
  uri: "postgresql://localhost:5432/testdb",
  username: "postgres",
  password: "test",
};

function neo4jDriverArgs(config: ConnectorConfig) {
  const {
    Neo4jAuthenticationModule,
  } = require("../src/neo4j/Neo4jAuthenticationModule");
  mockNeo4jDriverFn.mockClear();
  new Neo4jAuthenticationModule(config);
  const [uri, auth, options] = mockNeo4jDriverFn.mock.calls[0];
  return { uri, auth, options };
}

function pgPoolArgs(config: ConnectorConfig) {
  const {
    PostgresAuthenticationModule,
  } = require("../src/postgresql/PostgresAuthenticationModule");
  // poolConstructorCalls accumulates, so reset and read the call just made.
  poolConstructorCalls.length = 0;
  new PostgresAuthenticationModule(config);
  return poolConstructorCalls[poolConstructorCalls.length - 1];
}

// ---------------------------------------------------------------------------
// Neo4j
// ---------------------------------------------------------------------------

describe("Neo4j driver options from the config bag", () => {
  it("builds basic auth from the bag's username and password", () => {
    const { uri, auth } = neo4jDriverArgs(neo4jConfig);
    expect(uri).toBe("bolt://localhost:7687");
    expect(auth).toEqual({ principal: "neo4j", credentials: "test" });
  });

  it("applies today's defaults when the bag carries no options", () => {
    expect(neo4jDriverArgs(neo4jConfig).options).toEqual({
      connectionTimeout: 30000,
      maxConnectionPoolSize: undefined, // the driver's own default (100)
      // #1678 — left unset, the driver waits its own 60 s default to acquire a
      // connection, doubling every attempt against a dead host. Pinned just
      // ABOVE the connect timeout, not equal to it: the pool arms its
      // acquisition timer before the socket arms its connect timer, so an
      // equal value fires first and the failure reads as a (retryable) pool
      // timeout instead of the connect failure the API maps to
      // CONNECTOR_UNAVAILABLE.
      connectionAcquisitionTimeout: 35000,
      // #1888 — executeRead/executeWrite retry ServiceUnavailable for the
      // driver's 30 s default; against a dead host all 30 s is backoff.
      maxTransactionRetryTime: 0,
    });
  });

  it("follows a custom connect timeout when no acquisition timeout is given (#1678)", () => {
    expect(
      neo4jDriverArgs({ ...neo4jConfig, connectionTimeout: 5000 }).options,
    ).toEqual(
      expect.objectContaining({
        connectionTimeout: 5000,
        connectionAcquisitionTimeout: 10000,
      }),
    );
  });

  it("reads connectionTimeout, maxPoolSize and connectionAcquisitionTimeout — unprefixed", () => {
    expect(
      neo4jDriverArgs({
        ...neo4jConfig,
        connectionTimeout: 5000,
        maxPoolSize: 50,
        connectionAcquisitionTimeout: 12000,
      }).options,
    ).toEqual(
      expect.objectContaining({
        connectionTimeout: 5000,
        maxConnectionPoolSize: 50,
        connectionAcquisitionTimeout: 12000,
      }),
    );
  });

  it("no longer reads the old prefixed keys", () => {
    expect(
      neo4jDriverArgs({
        ...neo4jConfig,
        neo4jConnectionTimeout: 5000,
        neo4jMaxPoolSize: 50,
        neo4jAcquisitionTimeout: 12000,
      }).options,
    ).toEqual(
      expect.objectContaining({
        connectionTimeout: 30000,
        maxConnectionPoolSize: undefined,
        connectionAcquisitionTimeout: 35000,
      }),
    );
  });

  it("ignores keys that are not its own — maxRows is the app's policy, queryTimeout is per query", () => {
    const base = neo4jDriverArgs(neo4jConfig).options;
    expect(
      neo4jDriverArgs({
        ...neo4jConfig,
        maxRows: 100,
        queryTimeout: 2000,
        idleTimeout: 1,
        somethingElse: true,
      }).options,
    ).toEqual(base);
  });

  it("falls back to the default when an option is not a number", () => {
    // The bag is validated before it gets here, but a driver option is the
    // wrong place to find out it was not.
    expect(
      neo4jDriverArgs({ ...neo4jConfig, connectionTimeout: "5000" }).options,
    ).toEqual(expect.objectContaining({ connectionTimeout: 30000 }));
  });
});

// ---------------------------------------------------------------------------
// PostgreSQL
// ---------------------------------------------------------------------------

describe("PostgreSQL pool options from the config bag", () => {
  it("builds host, port, user and password from the bag", () => {
    expect(pgPoolArgs(pgConfig)).toEqual({
      user: "postgres",
      password: "test",
      host: "localhost",
      port: 5432,
      database: "testdb",
      // today's defaults
      connectionTimeoutMillis: 10000,
      idleTimeoutMillis: 10000,
      max: 10,
    });
  });

  it("reads connectionTimeout, idleTimeout and maxPoolSize — unprefixed", () => {
    expect(
      pgPoolArgs({
        ...pgConfig,
        connectionTimeout: 5000,
        idleTimeout: 20000,
        maxPoolSize: 25,
      }),
    ).toEqual(
      expect.objectContaining({
        connectionTimeoutMillis: 5000,
        idleTimeoutMillis: 20000,
        max: 25,
      }),
    );
  });

  it("no longer reads the old prefixed keys", () => {
    expect(
      pgPoolArgs({
        ...pgConfig,
        pgConnectionTimeoutMillis: 5000,
        pgIdleTimeoutMillis: 20000,
        pgMaxPoolSize: 25,
        pgSslRejectUnauthorized: true,
      }),
    ).toEqual(pgPoolArgs(pgConfig));
  });

  it("ignores keys that are not its own", () => {
    expect(
      pgPoolArgs({
        ...pgConfig,
        maxRows: 100,
        queryTimeout: 2000,
        statementTimeout: 60000, // per query + introspection, not a pool option
        connectionAcquisitionTimeout: 1,
      }),
    ).toEqual(pgPoolArgs(pgConfig));
  });

  it("falls back to the default when an option is not a number", () => {
    expect(pgPoolArgs({ ...pgConfig, maxPoolSize: "25" }).max).toBe(10);
  });

  // -------------------------------------------------------------------------
  // database — the connector applies it itself (#1897). The app used to patch
  // it onto the URI (ensureDatabaseInUri); the precedence is the same.
  // -------------------------------------------------------------------------

  describe("database", () => {
    const bare = "postgresql://localhost:5432";

    it("uses the bag's database when the URI has no path", () => {
      expect(pgPoolArgs({ ...pgConfig, uri: bare, database: "sales" })).toEqual(
        expect.objectContaining({ database: "sales" }),
      );
    });

    it("treats a bare trailing slash as no path", () => {
      expect(
        pgPoolArgs({ ...pgConfig, uri: bare + "/", database: "sales" })
          .database,
      ).toBe("sales");
    });

    it("lets a database already on the URI path win", () => {
      expect(pgPoolArgs({ ...pgConfig, database: "sales" }).database).toBe(
        "testdb",
      );
    });

    it.each([undefined, ""])(
      "falls back to 'postgres' when the URI has no path and database is %p",
      (database) => {
        expect(pgPoolArgs({ ...pgConfig, uri: bare, database }).database).toBe(
          "postgres",
        );
      },
    );

    it("keeps the query string out of the database name", () => {
      expect(
        pgPoolArgs({
          ...pgConfig,
          uri: bare + "?sslmode=require",
          database: "sales",
        }).database,
      ).toBe("sales");
    });
  });

  // -------------------------------------------------------------------------
  // TLS — sslRejectUnauthorized, else the URI's sslmode (#1299)
  //
  // Every managed Postgres hands you a URI with ?sslmode=require. Dropping it
  // means NeoBoard silently connects to a customer's production database in
  // PLAINTEXT, with nothing in the UI or logs to say so.
  // -------------------------------------------------------------------------

  describe("ssl", () => {
    const withUri = (uri: string, extra: ConnectorConfig = {}) =>
      pgPoolArgs({ ...pgConfig, uri, ...extra });

    it("passes sslRejectUnauthorized: false through", () => {
      expect(
        pgPoolArgs({ ...pgConfig, sslRejectUnauthorized: false }).ssl,
      ).toEqual({ rejectUnauthorized: false });
    });

    it("passes sslRejectUnauthorized: true through", () => {
      expect(
        pgPoolArgs({ ...pgConfig, sslRejectUnauthorized: true }).ssl,
      ).toEqual({ rejectUnauthorized: true });
    });

    it("omits ssl when neither the bag nor the URI asks for it", () => {
      expect(pgPoolArgs(pgConfig)).not.toHaveProperty("ssl");
    });

    it("honours sslmode=require from the URI", () => {
      // libpq semantics: require = encrypt, do not verify the certificate.
      expect(
        withUri("postgresql://localhost:5432/testdb?sslmode=require").ssl,
      ).toEqual({ rejectUnauthorized: false });
    });

    it.each(["verify-full", "verify-ca"])(
      "honours sslmode=%s from the URI",
      (mode) => {
        expect(
          withUri(`postgresql://localhost:5432/testdb?sslmode=${mode}`).ssl,
        ).toEqual({ rejectUnauthorized: true });
      },
    );

    it("treats sslmode=disable as explicitly no TLS", () => {
      expect(
        withUri("postgresql://localhost:5432/testdb?sslmode=disable").ssl,
      ).toBe(false);
    });

    it("lets the explicit option override the URI", () => {
      // sslRejectUnauthorized is set deliberately by an operator in the
      // connection form; a query param inherited from a copy-pasted URI must
      // not silently win over it.
      expect(
        withUri("postgresql://localhost:5432/testdb?sslmode=verify-full", {
          sslRejectUnauthorized: false,
        }).ssl,
      ).toEqual({ rejectUnauthorized: false });
    });

    it("does not mistake a database named like a param for sslmode", () => {
      expect(
        withUri("postgresql://localhost:5432/sslmode=require"),
      ).not.toHaveProperty("ssl");
    });
  });
});

// ---------------------------------------------------------------------------
// Protocols come from the descriptor — one list, not a copy per auth module
// ---------------------------------------------------------------------------

describe("URI protocols are read from the descriptor", () => {
  const withProtocols = (
    descriptorPath: string,
    exportName: string,
    protocols: string[],
  ) => {
    const real = jest.requireActual(descriptorPath)[exportName];
    jest.doMock(descriptorPath, () => ({
      [exportName]: {
        ...real,
        fields: real.fields.map((f: { type: string }) =>
          f.type === "uri" ? { ...f, protocols } : f,
        ),
      },
    }));
  };

  afterEach(() => {
    jest.dontMock("../src/neo4j/descriptor");
    jest.dontMock("../src/postgresql/descriptor");
    jest.resetModules();
  });

  it("neo4j: accepts what the descriptor lists and nothing else", () => {
    jest.resetModules();
    withProtocols("../src/neo4j/descriptor", "neo4jDescriptor", ["fixture:"]);
    const {
      Neo4jAuthenticationModule,
    } = require("../src/neo4j/Neo4jAuthenticationModule");

    expect(
      () =>
        new Neo4jAuthenticationModule({ ...neo4jConfig, uri: "fixture://h" }),
    ).not.toThrow();
    expect(() => new Neo4jAuthenticationModule(neo4jConfig)).toThrow(
      /Invalid URI protocol "bolt:". Expected one of: fixture:/,
    );
  });

  it("postgresql: accepts what the descriptor lists and nothing else", () => {
    jest.resetModules();
    withProtocols("../src/postgresql/descriptor", "postgresDescriptor", [
      "fixture:",
    ]);
    const {
      PostgresAuthenticationModule,
    } = require("../src/postgresql/PostgresAuthenticationModule");

    expect(
      () =>
        new PostgresAuthenticationModule({
          ...pgConfig,
          uri: "fixture://h/db",
        }),
    ).not.toThrow();
    expect(() => new PostgresAuthenticationModule(pgConfig)).toThrow(
      /Invalid URI protocol "postgresql:". Expected one of: fixture:/,
    );
  });

  it.each([
    [
      "neo4j",
      "../src/neo4j/Neo4jAuthenticationModule",
      "Neo4jAuthenticationModule",
      ["neo4j:", "neo4j+s:", "neo4j+ssc:", "bolt:", "bolt+s:", "bolt+ssc:"],
    ],
    [
      "postgresql",
      "../src/postgresql/PostgresAuthenticationModule",
      "PostgresAuthenticationModule",
      ["postgresql:", "postgres:"],
    ],
  ])(
    "%s: still accepts exactly today's schemes",
    (_type, modulePath, exportName, schemes) => {
      const Module = require(modulePath)[exportName];
      for (const scheme of schemes) {
        expect(
          () => new Module({ ...pgConfig, uri: `${scheme}//localhost/db` }),
        ).not.toThrow();
      }
      expect(
        () => new Module({ ...pgConfig, uri: "mysql://localhost/db" }),
      ).toThrow(/Invalid URI protocol/);
    },
  );
});

// ---------------------------------------------------------------------------
// createConnectionModule(type, config) — one bag through the registry
// ---------------------------------------------------------------------------

describe("createConnectionModule(type, config)", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    poolConstructorCalls.length = 0;
  });

  it("hands the bag to the Neo4j module", () => {
    const { createConnectionModule } = require("../src/connector-registry");
    const module = createConnectionModule("neo4j", {
      ...neo4jConfig,
      connectionTimeout: 15000,
    });
    expect(module).toBeDefined();
    expect(mockNeo4jDriverFn).toHaveBeenCalledWith(
      neo4jConfig.uri,
      expect.anything(),
      expect.objectContaining({ connectionTimeout: 15000 }),
    );
  });

  it("hands the bag to the PostgreSQL module", () => {
    const { createConnectionModule } = require("../src/connector-registry");
    const module = createConnectionModule("postgresql", {
      ...pgConfig,
      maxPoolSize: 30,
    });
    expect(module).toBeDefined();
    expect(poolConstructorCalls).toHaveLength(1);
    expect(poolConstructorCalls[0]).toEqual(
      expect.objectContaining({ max: 30 }),
    );
  });

  it("takes exactly two arguments — there is no separate options bag", () => {
    const { createConnectionModule } = require("../src/connector-registry");
    expect(createConnectionModule).toHaveLength(2);
    const { neo4jPlugin } = require("../src/neo4j/plugin");
    const { postgresPlugin } = require("../src/postgresql/plugin");
    expect(neo4jPlugin.createModule).toHaveLength(1);
    expect(postgresPlugin.createModule).toHaveLength(1);
  });
});

describe("DEFAULT_CONNECTION_CONFIG (#973)", () => {
  test("default query timeout is the documented 30s, not 2s", async () => {
    const { DEFAULT_CONNECTION_CONFIG } =
      await import("@neoboard/connector-sdk");
    expect(DEFAULT_CONNECTION_CONFIG.timeout).toBe(30_000);
  });
});
