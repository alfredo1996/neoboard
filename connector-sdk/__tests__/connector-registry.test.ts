import {
  createConnectorRegistry,
  type ConnectorPlugin,
} from "../src/generalized/connector-plugin";

// The registry lives here; its tests used to live only in connection/, so
// this package's own coverage never saw it.

const makePlugin = (
  overrides: Partial<ConnectorPlugin> = {},
): ConnectorPlugin => ({
  type: "test-db",
  label: "Test DB",
  category: "database",
  createModule: () => ({ runQuery: jest.fn() }) as never,
  ...overrides,
});

afterEach(() => jest.restoreAllMocks());

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

  it("throws when type is empty or blank", () => {
    const reg = createConnectorRegistry();
    expect(() => reg.register(makePlugin({ type: "" }))).toThrow(
      /type is required/,
    );
    expect(() => reg.register(makePlugin({ type: "   " }))).toThrow(
      /type is required/,
    );
  });

  it("throws when label is empty or blank", () => {
    const reg = createConnectorRegistry();
    expect(() => reg.register(makePlugin({ label: "" }))).toThrow(
      /label is required/,
    );
    expect(() => reg.register(makePlugin({ label: "   " }))).toThrow(
      /label is required/,
    );
  });

  it("throws when createModule is not a function", () => {
    const reg = createConnectorRegistry();
    expect(() =>
      reg.register(makePlugin({ createModule: "nope" as never })),
    ).toThrow(/createModule must be a function/);
  });

  it("unregister() removes a registered plugin", () => {
    const reg = createConnectorRegistry();
    reg.register(makePlugin());
    reg.unregister("test-db");
    expect(reg.has("test-db")).toBe(false);
  });

  it("unregister() is a no-op for non-existent type", () => {
    const reg = createConnectorRegistry();
    expect(() => reg.unregister("non-existent")).not.toThrow();
  });

  it("register succeeds after unregister of the same type", () => {
    const reg = createConnectorRegistry();
    reg.register(makePlugin());
    reg.unregister("test-db");
    const plugin2 = makePlugin({ label: "Test DB v2" });
    reg.register(plugin2);
    expect(reg.get("test-db")).toBe(plugin2);
  });

  it("getAll() reflects removal after unregister", () => {
    const reg = createConnectorRegistry();
    reg.register(makePlugin({ type: "a", label: "A" }));
    reg.register(makePlugin({ type: "b", label: "B" }));
    reg.unregister("a");
    expect(reg.getAll().map((p) => p.type)).toEqual(["b"]);
  });
});

describe("createConnectorRegistry — formFields and category warnings", () => {
  it("registers well-formed formFields without a warning", () => {
    const warn = jest.spyOn(console, "warn").mockImplementation(() => {});
    const reg = createConnectorRegistry();
    reg.register(
      makePlugin({
        formFields: [
          { key: "uri", label: "URI", type: "text" },
          {
            key: "mode",
            label: "Mode",
            type: "select",
            options: [{ label: "A", value: "a" }],
          },
        ],
      }),
    );
    expect(warn).not.toHaveBeenCalled();
    expect(reg.has("test-db")).toBe(true);
  });

  it("warns once per field missing key/label/type and skips its duplicate check", () => {
    const warn = jest.spyOn(console, "warn").mockImplementation(() => {});
    const reg = createConnectorRegistry();
    reg.register(
      makePlugin({
        formFields: [
          { key: "", label: "A", type: "text" },
          { key: "", label: "B", type: "text" },
        ],
      }),
    );
    expect(warn).toHaveBeenCalledTimes(2);
    for (const [message] of warn.mock.calls) {
      expect(message).toContain("missing key/label/type");
    }
    expect(reg.has("test-db")).toBe(true);
  });

  it("warns about a duplicate formField key", () => {
    const warn = jest.spyOn(console, "warn").mockImplementation(() => {});
    createConnectorRegistry().register(
      makePlugin({
        formFields: [
          { key: "uri", label: "URI", type: "text" },
          { key: "uri", label: "URI again", type: "text" },
        ],
      }),
    );
    expect(warn).toHaveBeenCalledWith(
      'Connector "test-db": duplicate formField key "uri"',
    );
  });

  it("warns about a select field with missing or empty options", () => {
    const warn = jest.spyOn(console, "warn").mockImplementation(() => {});
    createConnectorRegistry().register(
      makePlugin({
        formFields: [
          { key: "a", label: "A", type: "select" },
          { key: "b", label: "B", type: "select", options: [] },
        ],
      }),
    );
    expect(warn.mock.calls.map(([message]) => message)).toEqual([
      'Connector "test-db": select field "a" has no options',
      'Connector "test-db": select field "b" has no options',
    ]);
  });

  it("warns about an invalid category but still registers", () => {
    const warn = jest.spyOn(console, "warn").mockImplementation(() => {});
    const reg = createConnectorRegistry();
    reg.register(makePlugin({ category: "cache" as never }));
    expect(warn).toHaveBeenCalledWith(
      'Connector "test-db": invalid category "cache". Expected: database, graph, api, file',
    );
    expect(reg.has("test-db")).toBe(true);
  });
});
