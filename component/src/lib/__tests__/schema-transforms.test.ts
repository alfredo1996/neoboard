import { describe, it, expect } from "vitest";
import { toSqlSchema, toCypherDbSchema } from "../schema-transforms";
import type { DatabaseSchema, CypherDbSchema } from "../schema-transforms";

// ---------------------------------------------------------------------------
// toSqlSchema
// ---------------------------------------------------------------------------

describe("toSqlSchema", () => {
  it("converts postgres schema to CM6 sql() format", () => {
    const schema: DatabaseSchema = {
      type: "postgresql",
      tables: [
        {
          name: "users",
          columns: [
            { name: "id", type: "integer", nullable: false },
            { name: "email", type: "text", nullable: false },
          ],
        },
        {
          name: "orders",
          columns: [
            { name: "id", type: "integer", nullable: false },
            { name: "total", type: "numeric", nullable: true },
          ],
        },
      ],
    };

    expect(toSqlSchema(schema)).toEqual({
      users: ["id", "email"],
      orders: ["id", "total"],
    });
  });

  it("returns empty object for schema with no tables", () => {
    const schema: DatabaseSchema = { type: "postgresql", tables: [] };
    expect(toSqlSchema(schema)).toEqual({});
  });

  it("returns empty object for schema with undefined tables", () => {
    const schema: DatabaseSchema = { type: "postgresql" };
    expect(toSqlSchema(schema)).toEqual({});
  });

  it("handles table with no columns", () => {
    const schema: DatabaseSchema = {
      type: "postgresql",
      tables: [{ name: "empty_table", columns: [] }],
    };
    expect(toSqlSchema(schema)).toEqual({ empty_table: [] });
  });

  it("handles large schemas correctly (200 tables x 50 columns)", () => {
    const tables = Array.from({ length: 200 }, (_, i) => ({
      name: `table_${i}`,
      columns: Array.from({ length: 50 }, (_, j) => ({
        name: `col_${j}`,
        type: "text",
        nullable: false,
      })),
    }));
    const schema: DatabaseSchema = { type: "postgresql", tables };

    const result = toSqlSchema(schema);

    expect(Object.keys(result)).toHaveLength(200);
    expect(result["table_0"]).toHaveLength(50);
  });
});

// ---------------------------------------------------------------------------
// toCypherDbSchema
// ---------------------------------------------------------------------------

describe("toCypherDbSchema", () => {
  it("converts neo4j schema to CypherDbSchema format", () => {
    const schema: DatabaseSchema = {
      type: "neo4j",
      labels: ["Person", "Movie"],
      relationshipTypes: ["ACTED_IN", "DIRECTED"],
      nodeProperties: {
        Person: [
          { name: "name", type: "String" },
          { name: "born", type: "Integer" },
        ],
        Movie: [{ name: "title", type: "String" }],
      },
      relProperties: {
        ACTED_IN: [{ name: "role", type: "String" }],
      },
    };

    const result = toCypherDbSchema(schema);

    expect(result.labels).toEqual(["Person", "Movie"]);
    expect(result.relationshipTypes).toEqual(["ACTED_IN", "DIRECTED"]);
    // propertyKeys is a flat deduplicated list across all node + rel properties
    expect(result.propertyKeys).toContain("name");
    expect(result.propertyKeys).toContain("born");
    expect(result.propertyKeys).toContain("title");
    expect(result.propertyKeys).toContain("role");
  });

  it("deduplicates property keys that appear across multiple labels", () => {
    const schema: DatabaseSchema = {
      type: "neo4j",
      labels: ["Person", "Company"],
      relationshipTypes: [],
      nodeProperties: {
        Person: [
          { name: "name", type: "String" },
          { name: "id", type: "Integer" },
        ],
        Company: [
          { name: "name", type: "String" },
          { name: "founded", type: "Integer" },
        ],
      },
      relProperties: {},
    };

    const { propertyKeys } = toCypherDbSchema(schema);
    // "name" appears in both labels — should only appear once
    expect(propertyKeys!.filter((k) => k === "name")).toHaveLength(1);
    expect(propertyKeys).toContain("id");
    expect(propertyKeys).toContain("founded");
  });

  it("handles empty schema gracefully", () => {
    const schema: DatabaseSchema = {
      type: "neo4j",
      labels: [],
      relationshipTypes: [],
      nodeProperties: {},
      relProperties: {},
    };

    const result = toCypherDbSchema(schema);
    expect(result.labels).toEqual([]);
    expect(result.relationshipTypes).toEqual([]);
    expect(result.propertyKeys).toEqual([]);
  });

  it("handles undefined optional fields", () => {
    const schema: DatabaseSchema = { type: "neo4j" };

    const result = toCypherDbSchema(schema);
    expect(result.labels).toEqual([]);
    expect(result.relationshipTypes).toEqual([]);
    expect(result.propertyKeys).toEqual([]);
  });

  it("returns a value conforming to CypherDbSchema type", () => {
    const schema: DatabaseSchema = {
      type: "neo4j",
      labels: ["Person"],
      relationshipTypes: ["KNOWS"],
      nodeProperties: {
        Person: [{ name: "name", type: "String" }],
      },
    };

    const result: CypherDbSchema = toCypherDbSchema(schema);
    expect(result).toHaveProperty("labels");
    expect(result).toHaveProperty("relationshipTypes");
    expect(result).toHaveProperty("propertyKeys");
  });

  it("filters out empty-string property keys", () => {
    const schema: DatabaseSchema = {
      type: "neo4j",
      labels: ["Node"],
      nodeProperties: {
        Node: [
          { name: "", type: "String" },
          { name: "valid", type: "String" },
        ],
      },
    };

    const result = toCypherDbSchema(schema);
    expect(result.propertyKeys).toEqual(["valid"]);
    expect(result.propertyKeys).not.toContain("");
  });
});
