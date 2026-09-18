import { describe, it, expect } from "vitest";
import {
  toSchemaTree,
  filterSchemaTree,
  quoteIdentifier,
  type SchemaTreeSection,
} from "../schema-tree";
import type { DatabaseSchema } from "../schema-transforms";

const neo4j: DatabaseSchema = {
  type: "neo4j",
  labels: ["Movie", "Person"],
  relationshipTypes: ["ACTED_IN"],
  nodeProperties: {
    Movie: [
      { name: "title", type: "String" },
      { name: "released", type: "Integer" },
    ],
    Person: [{ name: "name", type: "String" }],
  },
  relProperties: { ACTED_IN: [{ name: "roles", type: "List" }] },
};

const postgres: DatabaseSchema = {
  type: "postgresql",
  tables: [
    {
      name: "movies",
      columns: [
        { name: "id", type: "integer", nullable: false },
        { name: "title", type: "text", nullable: false },
      ],
    },
    {
      name: "people",
      columns: [{ name: "name", type: "text", nullable: true }],
    },
  ],
};

describe("toSchemaTree", () => {
  it("builds Labels and Relationship types sections for Neo4j", () => {
    expect(toSchemaTree(neo4j)).toEqual<SchemaTreeSection[]>([
      {
        title: "Labels",
        nodes: [
          {
            name: "Movie",
            children: [
              { name: "title", type: "String" },
              { name: "released", type: "Integer" },
            ],
          },
          { name: "Person", children: [{ name: "name", type: "String" }] },
        ],
      },
      {
        title: "Relationship types",
        nodes: [
          { name: "ACTED_IN", children: [{ name: "roles", type: "List" }] },
        ],
      },
    ]);
  });

  it("builds a Tables section for PostgreSQL", () => {
    expect(toSchemaTree(postgres)).toEqual<SchemaTreeSection[]>([
      {
        title: "Tables",
        nodes: [
          {
            name: "movies",
            children: [
              { name: "id", type: "integer" },
              { name: "title", type: "text" },
            ],
          },
          { name: "people", children: [{ name: "name", type: "text" }] },
        ],
      },
    ]);
  });

  it("gives a label with no known properties an empty children list", () => {
    const tree = toSchemaTree({ type: "neo4j", labels: ["Orphan"] });
    expect(tree[0].nodes).toEqual([{ name: "Orphan", children: [] }]);
  });

  // A stale or foreign schema can still carry the NULL property row Neo4j
  // emits for a property-less label (#1714); it must not become a child.
  it("drops a null-named property the way the completion transform does", () => {
    const tree = toSchemaTree({
      type: "neo4j",
      labels: ["Empty"],
      relationshipTypes: ["DIRECTED"],
      nodeProperties: {
        Empty: [{ name: null as unknown as string, type: "null" }],
      },
      relProperties: {
        DIRECTED: [{ name: null as unknown as string, type: "null" }],
      },
    });
    expect(tree).toEqual([
      { title: "Labels", nodes: [{ name: "Empty", children: [] }] },
      {
        title: "Relationship types",
        nodes: [{ name: "DIRECTED", children: [] }],
      },
    ]);
    expect(() => filterSchemaTree(tree, "rol")).not.toThrow();
  });

  it("drops null labels the way the completion transform does", () => {
    const tree = toSchemaTree({
      type: "neo4j",
      labels: ["Movie", null as unknown as string],
    });
    expect(tree[0].nodes.map((n) => n.name)).toEqual(["Movie"]);
  });

  it("omits sections that have no nodes", () => {
    expect(toSchemaTree({ type: "neo4j", labels: ["Movie"] })).toHaveLength(1);
    expect(toSchemaTree({ type: "postgresql" })).toEqual([]);
  });
});

describe("filterSchemaTree", () => {
  const tree = toSchemaTree(neo4j);

  it("returns the tree untouched for a blank query", () => {
    expect(filterSchemaTree(tree, "")).toBe(tree);
    expect(filterSchemaTree(tree, "   ")).toBe(tree);
  });

  it("keeps a node whose name matches, with all its children", () => {
    const out = filterSchemaTree(tree, "mov");
    expect(out).toEqual([{ title: "Labels", nodes: [tree[0].nodes[0]] }]);
  });

  it("keeps a node whose child matches, with only the matching children", () => {
    const out = filterSchemaTree(tree, "TITLE");
    expect(out).toEqual([
      {
        title: "Labels",
        nodes: [
          { name: "Movie", children: [{ name: "title", type: "String" }] },
        ],
      },
    ]);
  });

  it("drops sections left with no nodes", () => {
    expect(filterSchemaTree(tree, "zzz")).toEqual([]);
  });
});

describe("quoteIdentifier", () => {
  it("leaves plain identifiers alone", () => {
    expect(quoteIdentifier("Movie", "cypher")).toBe("Movie");
    expect(quoteIdentifier("acted_in2", "sql")).toBe("acted_in2");
  });

  it("backtick-quotes Cypher identifiers that need it", () => {
    expect(quoteIdentifier("Film Noir", "neo4j")).toBe("`Film Noir`");
    expect(quoteIdentifier("2fast", "cypher")).toBe("`2fast`");
  });

  it("double-quotes SQL identifiers that need it", () => {
    expect(quoteIdentifier("Order Items", "postgresql")).toBe('"Order Items"');
    expect(quoteIdentifier("MixedCase", "sql")).toBe('"MixedCase"');
  });

  it("double-quotes SQL reserved words, which PostgreSQL would misparse", () => {
    expect(quoteIdentifier("user", "sql")).toBe('"user"');
    expect(quoteIdentifier("order", "postgresql")).toBe('"order"');
    expect(quoteIdentifier("end", "sql")).toBe('"end"');
    expect(quoteIdentifier("left", "sql")).toBe('"left"');
  });

  it("leaves Cypher keywords bare — labels and property keys accept them", () => {
    expect(quoteIdentifier("end", "cypher")).toBe("end");
    expect(quoteIdentifier("Match", "neo4j")).toBe("Match");
  });

  it("escapes an embedded quote character", () => {
    expect(quoteIdentifier("a`b", "cypher")).toBe("`a``b`");
    expect(quoteIdentifier('a"b', "sql")).toBe('"a""b"');
  });
});
