import {
  getSchemaManager,
  registerConnector,
  unregisterConnector,
} from "../src/connector-registry";
import { Neo4jSchemaManager } from "../src/schema/neo4j-schema";
import { PostgresSchemaManager } from "../src/schema/pg-schema";
import type { ConnectorPlugin } from "@neoboard/connector-sdk";

// #1119 — schema-manager dispatch is keyed by connector type through the
// registry (no hardcoded 'neo4j' | 'postgresql' union). A plugin supplies its
// own manager via the optional `createSchemaManager()` factory.

const fakeModule = () =>
  ({ runQuery: jest.fn(), checkConnection: jest.fn() }) as never;

describe("getSchemaManager", () => {
  it("resolves the built-in Neo4j schema manager", () => {
    expect(getSchemaManager("neo4j")).toBeInstanceOf(Neo4jSchemaManager);
  });

  it("resolves the built-in PostgreSQL schema manager", () => {
    expect(getSchemaManager("postgresql")).toBeInstanceOf(
      PostgresSchemaManager,
    );
  });

  it("returns undefined for an unknown connector type", () => {
    expect(getSchemaManager("nope")).toBeUndefined();
  });

  it("resolves a registry-supplied connector's own schema manager", () => {
    const fakeSchemaManager = { fetchSchema: jest.fn() };
    const plugin: ConnectorPlugin = {
      type: "fixture-db",
      label: "Fixture DB",
      category: "database",
      createModule: fakeModule,
      createSchemaManager: () => fakeSchemaManager,
    };
    registerConnector(plugin);
    try {
      expect(getSchemaManager("fixture-db")).toBe(fakeSchemaManager);
    } finally {
      unregisterConnector("fixture-db");
    }
  });

  it("returns undefined for a connector without a schema-manager factory", () => {
    const plugin: ConnectorPlugin = {
      type: "no-schema-db",
      label: "No Schema DB",
      category: "database",
      createModule: fakeModule,
    };
    registerConnector(plugin);
    try {
      expect(getSchemaManager("no-schema-db")).toBeUndefined();
    } finally {
      unregisterConnector("no-schema-db");
    }
  });
});
