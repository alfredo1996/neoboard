import { toTerms } from "../src/schema/terms";
import type { DatabaseSchema } from "../src/schema/types";

describe("toTerms", () => {
  it("lists a graph schema as entities, relationships and properties", () => {
    const schema: DatabaseSchema = {
      type: "g",
      labels: ["Person", "Movie"],
      relationshipTypes: ["ACTED_IN"],
      relationshipPatterns: [
        { type: "ACTED_IN", from: "Person", to: "Movie" },
        { type: "ACTED_IN", from: "Person", to: "Show" },
      ],
      nodeProperties: {
        Person: [{ name: "name", type: "String" }],
        Movie: [{ name: "released", type: "Integer" }],
      },
      relProperties: { ACTED_IN: [{ name: "roles", type: "List" }] },
    };
    expect(toTerms(schema)).toEqual([
      { kind: "entity", key: "Person", parentKey: "" },
      {
        kind: "property",
        key: "name",
        parentKey: "entity:Person",
        type: "String",
      },
      { kind: "entity", key: "Movie", parentKey: "" },
      {
        kind: "property",
        key: "released",
        parentKey: "entity:Movie",
        type: "Integer",
      },
      {
        kind: "relationship",
        key: "ACTED_IN",
        parentKey: "",
        joins: [
          { from: "Person", to: "Movie" },
          { from: "Person", to: "Show" },
        ],
      },
      {
        kind: "property",
        key: "roles",
        parentKey: "relationship:ACTED_IN",
        type: "List",
      },
    ]);
  });

  it("lists a table schema with primary keys and one relationship per foreign key", () => {
    const schema: DatabaseSchema = {
      type: "t",
      tables: [
        {
          name: "customers",
          primaryKey: ["id"],
          columns: [
            { name: "id", type: "integer", nullable: false },
            { name: "email", type: "text", nullable: true },
          ],
        },
        {
          name: "orders",
          primaryKey: ["id"],
          columns: [
            { name: "id", type: "integer", nullable: false },
            { name: "customer_id", type: "integer", nullable: true },
          ],
          foreignKeys: [
            {
              columns: ["customer_id"],
              refTable: "customers",
              refColumns: ["id"],
            },
          ],
        },
      ],
    };
    expect(toTerms(schema)).toEqual([
      { kind: "entity", key: "customers", parentKey: "" },
      {
        kind: "property",
        key: "id",
        parentKey: "entity:customers",
        type: "integer",
        primaryKey: true,
      },
      {
        kind: "property",
        key: "email",
        parentKey: "entity:customers",
        type: "text",
      },
      { kind: "entity", key: "orders", parentKey: "" },
      {
        kind: "property",
        key: "id",
        parentKey: "entity:orders",
        type: "integer",
        primaryKey: true,
      },
      {
        kind: "property",
        key: "customer_id",
        parentKey: "entity:orders",
        type: "integer",
      },
      {
        kind: "relationship",
        key: "orders(customer_id)->customers(id)",
        parentKey: "",
        joins: [
          {
            from: "orders",
            to: "customers",
            fromColumns: ["customer_id"],
            toColumns: ["id"],
          },
        ],
      },
    ]);
  });

  it("gives two foreign keys on the same columns, to different tables, their own terms", () => {
    const fk = (refTable: string) => ({
      columns: ["owner_id"],
      refTable,
      refColumns: ["id"],
    });
    const keys = toTerms({
      type: "t",
      tables: [
        {
          name: "docs",
          columns: [{ name: "owner_id", type: "integer", nullable: true }],
          foreignKeys: [fk("users"), fk("teams")],
        },
      ],
    })
      .filter((t) => t.kind === "relationship")
      .map((t) => t.key);
    expect(keys).toEqual([
      "docs(owner_id)->users(id)",
      "docs(owner_id)->teams(id)",
    ]);
  });

  it("keeps an entity's and a relationship's properties apart when they share a name", () => {
    const terms = toTerms({
      type: "g",
      labels: ["KNOWS"],
      relationshipTypes: ["KNOWS"],
      nodeProperties: { KNOWS: [{ name: "since", type: "Integer" }] },
      relProperties: { KNOWS: [{ name: "since", type: "Date" }] },
    });
    const ids = terms.map((t) => `${t.kind}|${t.key}|${t.parentKey}`);
    expect(ids).toHaveLength(4);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("reads the plain property maps a graph schema manager returns (CR4)", () => {
    const terms = toTerms({
      type: "g",
      labels: ["Movie"],
      relationshipTypes: ["ACTED_IN"],
      nodeProperties: { Movie: [{ name: "title", type: "String" }] },
      relProperties: { ACTED_IN: [{ name: "role", type: "String" }] },
    });
    expect(terms).toContainEqual({
      kind: "property",
      key: "title",
      parentKey: "entity:Movie",
      type: "String",
    });
    expect(terms).toContainEqual({
      kind: "property",
      key: "role",
      parentKey: "relationship:ACTED_IN",
      type: "String",
    });
  });

  it("gives no property terms, and does not throw, for a name the maps do not hold", () => {
    const terms = toTerms({
      type: "g",
      labels: ["toString"],
      relationshipTypes: ["constructor"],
      nodeProperties: {},
      relProperties: {},
    });
    expect(terms.map((t) => t.kind)).toEqual(["entity", "relationship"]);
  });

  it("keeps two foreign keys whose column lists differ only by a comma apart", () => {
    const fk = (columns: string[], refColumns: string[]) => ({
      columns,
      refTable: "targets",
      refColumns,
    });
    const keys = toTerms({
      type: "t",
      tables: [
        {
          name: "docs",
          columns: [],
          foreignKeys: [fk(["a", "b"], ["x", "y"]), fk(["a,b"], ["x,y"])],
        },
      ],
    })
      .filter((t) => t.kind === "relationship")
      .map((t) => t.key);
    expect(new Set(keys).size).toBe(2);
    expect(keys[0]).toBe("docs(a,b)->targets(x,y)");
  });

  it("gives no terms for a schema that describes nothing", () => {
    expect(toTerms({ type: "x" })).toEqual([]);
  });
});
