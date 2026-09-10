import {
  createConnectorRegistry,
  type BuiltQuery,
  type ConnectorPlugin,
  type QuerySpec,
} from "../src/generalized/connector-plugin";

// #1696 — a connector may own its query dialect through an optional
// buildQuery(spec). The registry hands it back untouched; connectors without
// one resolve to undefined so the UI can hide the guided builder.

const fakeModule = () => ({ runQuery: jest.fn() }) as never;

describe("ConnectorPlugin.buildQuery contract (#1696)", () => {
  it("is reachable through the registry and returns text plus params", () => {
    const build = (spec: QuerySpec): BuiltQuery => ({
      query: `FROM ${spec.source} PICK ${spec.fields.join(",")}`,
      params: spec.filter ? { param_v: spec.filter.value } : {},
    });
    const registry = createConnectorRegistry();
    registry.register({
      type: "fixture-db",
      label: "Fixture DB",
      category: "database",
      createModule: fakeModule,
      buildQuery: build,
    });

    const spec: QuerySpec = {
      source: "movies",
      fields: ["title"],
      filter: { field: "released", op: ">", value: 2000 },
      limit: 10,
    };
    expect(registry.get("fixture-db")?.buildQuery?.(spec)).toEqual({
      query: "FROM movies PICK title",
      params: { param_v: 2000 },
    });
  });

  it("is optional — a plugin without one resolves to undefined", () => {
    const registry = createConnectorRegistry();
    const plugin: ConnectorPlugin = {
      type: "plain",
      label: "Plain",
      category: "database",
      createModule: fakeModule,
    };
    registry.register(plugin);
    expect(registry.get("plain")?.buildQuery).toBeUndefined();
  });
});
