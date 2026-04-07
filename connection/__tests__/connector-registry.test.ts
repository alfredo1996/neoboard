import {
  createConnectorRegistry,
  type ConnectorPlugin,
} from "../src/generalized/connector-plugin";

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

  it("neo4j plugin has formFields with required uri/username/password", () => {
    const { neo4jPlugin } = require("../src/neo4j/plugin");
    expect(neo4jPlugin.formFields).toBeDefined();
    expect(Array.isArray(neo4jPlugin.formFields)).toBe(true);

    const keys = neo4jPlugin.formFields.map((f: any) => f.key);
    expect(keys).toContain("uri");
    expect(keys).toContain("username");
    expect(keys).toContain("password");

    const uri = neo4jPlugin.formFields.find((f: any) => f.key === "uri");
    expect(uri.required).toBe(true);
    const username = neo4jPlugin.formFields.find(
      (f: any) => f.key === "username",
    );
    expect(username.required).toBe(true);
    const password = neo4jPlugin.formFields.find(
      (f: any) => f.key === "password",
    );
    expect(password.required).toBe(true);
  });

  it("postgresql plugin has formFields with required uri/username/password", () => {
    const { postgresPlugin } = require("../src/postgresql/plugin");
    expect(postgresPlugin.formFields).toBeDefined();
    expect(Array.isArray(postgresPlugin.formFields)).toBe(true);

    const keys = postgresPlugin.formFields.map((f: any) => f.key);
    expect(keys).toContain("uri");
    expect(keys).toContain("username");
    expect(keys).toContain("password");

    const uri = postgresPlugin.formFields.find((f: any) => f.key === "uri");
    expect(uri.required).toBe(true);
    const username = postgresPlugin.formFields.find(
      (f: any) => f.key === "username",
    );
    expect(username.required).toBe(true);
    const password = postgresPlugin.formFields.find(
      (f: any) => f.key === "password",
    );
    expect(password.required).toBe(true);
  });

  it("all formFields have key, label, and type", () => {
    const { neo4jPlugin } = require("../src/neo4j/plugin");
    const { postgresPlugin } = require("../src/postgresql/plugin");

    for (const plugin of [neo4jPlugin, postgresPlugin]) {
      for (const field of plugin.formFields) {
        expect(field.key).toBeDefined();
        expect(typeof field.key).toBe("string");
        expect(field.label).toBeDefined();
        expect(typeof field.label).toBe("string");
        expect(field.type).toBeDefined();
        expect(["text", "password", "number", "select", "boolean"]).toContain(
          field.type,
        );
      }
    }
  });

  it("plugin without formFields has undefined field (backward compatible)", () => {
    const plugin = makePlugin();
    expect(plugin.formFields).toBeUndefined();
  });
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
