import { describe, it, expect, beforeEach } from "vitest";
import type { DatabaseSchema } from "@/lib/schema-types";
import { useSchemaStore } from "../schema-store";

const neo4jSchema: DatabaseSchema = {
  type: "neo4j",
  labels: ["Person", "Movie"],
  relationshipTypes: ["ACTED_IN"],
  nodeProperties: { Person: [{ name: "name", type: "String" }] },
  relProperties: {},
};

const pgSchema: DatabaseSchema = {
  type: "postgresql",
  tables: [
    { name: "users", columns: [{ name: "id", type: "integer", nullable: false }] },
  ],
};

describe("useSchemaStore", () => {
  beforeEach(() => {
    useSchemaStore.setState({ schemas: {} });
  });

  it("initializes with empty schemas", () => {
    expect(useSchemaStore.getState().schemas).toEqual({});
  });

  it("setSchema stores schema for a connection", () => {
    useSchemaStore.getState().setSchema("conn-1", neo4jSchema);
    expect(useSchemaStore.getState().schemas["conn-1"]).toEqual(neo4jSchema);
  });

  it("getSchema returns the stored schema", () => {
    useSchemaStore.getState().setSchema("conn-2", pgSchema);
    expect(useSchemaStore.getState().getSchema("conn-2")).toEqual(pgSchema);
  });

  it("getSchema returns undefined for unknown connection", () => {
    expect(useSchemaStore.getState().getSchema("unknown")).toBeUndefined();
  });

  it("setSchema overwrites existing schema", () => {
    useSchemaStore.getState().setSchema("conn-1", neo4jSchema);
    useSchemaStore.getState().setSchema("conn-1", pgSchema);
    expect(useSchemaStore.getState().getSchema("conn-1")).toEqual(pgSchema);
  });

  it("stores multiple schemas independently", () => {
    useSchemaStore.getState().setSchema("conn-1", neo4jSchema);
    useSchemaStore.getState().setSchema("conn-2", pgSchema);
    expect(useSchemaStore.getState().getSchema("conn-1")).toEqual(neo4jSchema);
    expect(useSchemaStore.getState().getSchema("conn-2")).toEqual(pgSchema);
  });

  it("clearSchema removes the entry for a connection", () => {
    useSchemaStore.getState().setSchema("conn-1", neo4jSchema);
    useSchemaStore.getState().clearSchema("conn-1");
    expect(useSchemaStore.getState().getSchema("conn-1")).toBeUndefined();
  });

  it("clearSchema does not affect other connections", () => {
    useSchemaStore.getState().setSchema("conn-1", neo4jSchema);
    useSchemaStore.getState().setSchema("conn-2", pgSchema);
    useSchemaStore.getState().clearSchema("conn-1");
    expect(useSchemaStore.getState().getSchema("conn-2")).toEqual(pgSchema);
  });

  it("clearSchema on unknown id is a no-op", () => {
    useSchemaStore.getState().setSchema("conn-1", neo4jSchema);
    expect(() => useSchemaStore.getState().clearSchema("unknown")).not.toThrow();
    expect(useSchemaStore.getState().getSchema("conn-1")).toEqual(neo4jSchema);
  });
});
