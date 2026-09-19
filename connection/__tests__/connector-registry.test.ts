import {
  createConnectorRegistry,
  type ConnectorPlugin,
} from "@neoboard/connector-sdk";

// ---------------------------------------------------------------------------
// Fixture
// ---------------------------------------------------------------------------

const fakeModule = { runQuery: jest.fn(), checkConnection: jest.fn() };

const makePlugin = (
  overrides: Partial<ConnectorPlugin> = {},
): ConnectorPlugin => ({
  type: "test-db",
  label: "Test DB",
  category: "database",
  fields: [],
  createModule: () => fakeModule as any,
  ...overrides,
});

// ---------------------------------------------------------------------------
// Registry
// ---------------------------------------------------------------------------

describe("createConnectorRegistry", () => {
  it("registers and retrieves a plugin by type", () => {
    const reg = createConnectorRegistry();
    const plugin = makePlugin();
    reg.register(plugin);
    expect(reg.get("test-db")).toBe(plugin);
  });

  it("returns undefined for unknown type", () => {
    const reg = createConnectorRegistry();
    expect(reg.get("unknown")).toBeUndefined();
  });

  it("has() returns true for registered types", () => {
    const reg = createConnectorRegistry();
    reg.register(makePlugin());
    expect(reg.has("test-db")).toBe(true);
    expect(reg.has("other")).toBe(false);
  });

  it("getAll() returns all registered plugins", () => {
    const reg = createConnectorRegistry();
    reg.register(makePlugin({ type: "a", label: "A" }));
    reg.register(makePlugin({ type: "b", label: "B" }));
    expect(reg.getAll()).toHaveLength(2);
  });

  it("getTypes() returns type strings", () => {
    const reg = createConnectorRegistry();
    reg.register(makePlugin({ type: "neo4j", label: "Neo4j" }));
    reg.register(makePlugin({ type: "pg", label: "PostgreSQL" }));
    expect(reg.getTypes()).toEqual(["neo4j", "pg"]);
  });

  it("throws on duplicate registration", () => {
    const reg = createConnectorRegistry();
    reg.register(makePlugin());
    expect(() => reg.register(makePlugin())).toThrow(/already registered/);
  });

  it("throws when type is empty", () => {
    const reg = createConnectorRegistry();
    expect(() => reg.register(makePlugin({ type: "" }))).toThrow(
      /type is required/,
    );
  });

  it("throws when label is empty", () => {
    const reg = createConnectorRegistry();
    expect(() => reg.register(makePlugin({ label: "" }))).toThrow(
      /label is required/,
    );
  });

  it("throws when createModule is not a function", () => {
    const reg = createConnectorRegistry();
    expect(() =>
      reg.register(makePlugin({ createModule: "nope" as any })),
    ).toThrow(/createModule must be a function/);
  });

  // -------------------------------------------------------------------------
  // unregister()
  // -------------------------------------------------------------------------

  it("unregister() removes a registered plugin", () => {
    const reg = createConnectorRegistry();
    reg.register(makePlugin());
    expect(reg.has("test-db")).toBe(true);
    reg.unregister("test-db");
    expect(reg.has("test-db")).toBe(false);
  });

  it("unregister() is a no-op for non-existent type", () => {
    const reg = createConnectorRegistry();
    expect(() => reg.unregister("non-existent")).not.toThrow();
  });

  it("register succeeds after unregister of the same type", () => {
    const reg = createConnectorRegistry();
    const plugin = makePlugin();
    reg.register(plugin);
    reg.unregister("test-db");
    const plugin2 = makePlugin({ label: "Test DB v2" });
    reg.register(plugin2);
    expect(reg.get("test-db")).toBe(plugin2);
  });

  it("getAll() reflects removal after unregister", () => {
    const reg = createConnectorRegistry();
    reg.register(makePlugin({ type: "a", label: "A" }));
    reg.register(makePlugin({ type: "b", label: "B" }));
    expect(reg.getAll()).toHaveLength(2);
    reg.unregister("a");
    expect(reg.getAll()).toHaveLength(1);
    expect(reg.getAll()[0].type).toBe("b");
  });
});

// ---------------------------------------------------------------------------
// Built-in plugins
// ---------------------------------------------------------------------------

describe("built-in connector plugins", () => {
  it("neo4j plugin has correct type and category", () => {
    const { neo4jPlugin } = require("../src/neo4j/plugin");
    expect(neo4jPlugin.type).toBe("neo4j");
    expect(neo4jPlugin.category).toBe("graph");
    expect(neo4jPlugin.supportsGraphData).toBe(true);
    expect(neo4jPlugin.queryLanguage).toBe("cypher");
  });

  it("postgresql plugin has correct type and category", () => {
    const { postgresPlugin } = require("../src/postgresql/plugin");
    expect(postgresPlugin.type).toBe("postgresql");
    expect(postgresPlugin.category).toBe("database");
    expect(postgresPlugin.supportsGraphData).toBe(false);
    expect(postgresPlugin.queryLanguage).toBe("sql");
  });

  // What the fields ARE is pinned in descriptors.test.ts; this only checks the
  // plugins expose them where the contract says (`fields`, not `formFields`).
  it.each(["neo4j", "postgresql"])(
    "%s plugin declares required uri/username/password fields",
    (type) => {
      const { getConnector } = require("../src/connector-registry");
      const fields = getConnector(type).fields;
      for (const key of ["uri", "username", "password"]) {
        expect(fields.find((f: any) => f.key === key)).toMatchObject({
          group: "connection",
          required: true,
        });
      }
    },
  );
});

// ---------------------------------------------------------------------------
// Global registry (auto-registered)
// ---------------------------------------------------------------------------

describe("global connector registry", () => {
  it("has neo4j and postgresql registered on import", () => {
    const { connectorRegistry } = require("../src/connector-registry");
    expect(connectorRegistry.has("neo4j")).toBe(true);
    expect(connectorRegistry.has("postgresql")).toBe(true);
  });

  it("getAll() returns both built-in connectors", () => {
    const { getAllConnectors } = require("../src/connector-registry");
    const all = getAllConnectors();
    expect(all).toHaveLength(2);
    expect(all.map((c: any) => c.type).sort()).toEqual(["neo4j", "postgresql"]);
  });

  it("createConnectionModule() delegates to the correct plugin", () => {
    const { createConnectionModule } = require("../src/connector-registry");
    // This would actually create a real Neo4jConnectionModule — just
    // verify it doesn't throw for a known type
    expect(() =>
      createConnectionModule("neo4j", {
        uri: "bolt://localhost:7687",
        username: "neo4j",
        password: "test",
        authType: 1,
      }),
    ).not.toThrow();
  });

  it("createConnectionModule() throws for unknown type", () => {
    const { createConnectionModule } = require("../src/connector-registry");
    expect(() =>
      createConnectionModule("mysql", { uri: "mysql://localhost" }),
    ).toThrow(/Unknown connector type.*mysql/);
  });
});

// ---------------------------------------------------------------------------
// toConnectorError (#1903) — a connector's errors, classified by ITS hook
// ---------------------------------------------------------------------------

describe("toConnectorError", () => {
  const {
    toConnectorError,
    registerConnector,
    unregisterConnector,
  } = require("../src/connector-registry");
  const {
    ConnectorError,
    ConnectorErrorType,
  } = require("@neoboard/connector-sdk");

  afterEach(() => unregisterConnector("test-db"));

  it("classifies a third connector's raw error through that connector's hook", () => {
    const classifyError = jest.fn(() => ({
      type: ConnectorErrorType.NETWORK,
      transient: false,
    }));
    registerConnector(makePlugin({ classifyError }));
    const raw = Object.assign(new Error("TESTDB-0042 listener down"), {
      code: "TESTDB-0042",
    });

    const wrapped = toConnectorError("test-db", raw);

    expect(classifyError).toHaveBeenCalledWith(raw);
    expect(wrapped).toBeInstanceOf(ConnectorError);
    expect(wrapped.message).toBe("TESTDB-0042 listener down");
    expect(wrapped.classification).toEqual({
      type: ConnectorErrorType.NETWORK,
      transient: false,
    });
  });

  it("routes each built-in's error to its own classifier", () => {
    const refused = { code: "28P01", message: "x" };
    expect(toConnectorError("postgresql", refused).type).toBe(
      ConnectorErrorType.AUTHENTICATION,
    );
    // The same error means nothing to a connector that does not own the code.
    expect(toConnectorError("neo4j", refused).type).toBe(
      ConnectorErrorType.QUERY,
    );
  });

  // Without a hook the SDK default applies. It reads the platform's own signals
  // — never a driver's — so a refused socket is still NETWORK and permanent,
  // even though the message also carries the word the transient table matches.
  it.each([
    ["a connector without the hook", () => registerConnector(makePlugin())],
    ["a type nobody registered", () => undefined],
  ])("falls back to the SDK default for %s", (_label, arrange) => {
    arrange();
    expect(
      toConnectorError("test-db", new Error("connect ECONNREFUSED timeout"))
        .classification,
    ).toEqual({ type: ConnectorErrorType.NETWORK, transient: false });
  });

  it.each([
    ["a connector without the hook", () => registerConnector(makePlugin())],
    ["a type nobody registered", () => undefined],
  ])("leaves a driver's own words to the driver for %s", (_label, arrange) => {
    arrange();
    expect(
      toConnectorError(
        "test-db",
        Object.assign(new Error("deadlock detected"), { code: "40P01" }),
      ).classification,
    ).toEqual({ type: ConnectorErrorType.UNKNOWN, transient: false });
  });

  it("returns an error that is already a ConnectorError as it is", () => {
    const typed = new ConnectorError("x", ConnectorErrorType.BAD_URI);
    expect(toConnectorError("postgresql", typed)).toBe(typed);
  });
});
