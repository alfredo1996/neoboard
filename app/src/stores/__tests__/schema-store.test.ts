import { describe, it, expect, beforeEach } from "vitest";
import { useSchemaStore } from "../schema-store";

describe("useSchemaStore", () => {
  beforeEach(() => {
    // Reset schemas to empty
    useSchemaStore.setState({ schemas: {} });
  });

  it("initializes with empty schemas", () => {
    expect(useSchemaStore.getState().schemas).toEqual({});
  });

  it("setSchema stores schema for a connection", () => {
    const schema = { labels: ["Person"], relationshipTypes: ["KNOWS"] };
    useSchemaStore.getState().setSchema("conn-1", schema);
    expect(useSchemaStore.getState().schemas["conn-1"]).toEqual(schema);
  });

  it("getSchema returns the stored schema", () => {
    const schema = { tables: ["users", "orders"] };
    useSchemaStore.getState().setSchema("conn-2", schema);
    expect(useSchemaStore.getState().getSchema("conn-2")).toEqual(schema);
  });

  it("getSchema returns undefined for unknown connection", () => {
    expect(useSchemaStore.getState().getSchema("unknown")).toBeUndefined();
  });

  it("setSchema overwrites existing schema", () => {
    useSchemaStore.getState().setSchema("conn-1", { v: 1 });
    useSchemaStore.getState().setSchema("conn-1", { v: 2 });
    expect(useSchemaStore.getState().getSchema("conn-1")).toEqual({ v: 2 });
  });

  it("stores multiple schemas independently", () => {
    useSchemaStore.getState().setSchema("conn-1", { a: 1 });
    useSchemaStore.getState().setSchema("conn-2", { b: 2 });
    expect(useSchemaStore.getState().getSchema("conn-1")).toEqual({ a: 1 });
    expect(useSchemaStore.getState().getSchema("conn-2")).toEqual({ b: 2 });
  });
});
