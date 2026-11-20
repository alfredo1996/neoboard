import { describe, it, expect } from "vitest";
import { hideTerms, meaningOf, termOption } from "../term-meaning";
import type { TermMeaning } from "../term-meaning";
import type { DatabaseSchema } from "../schema-transforms";

const term = (over: Partial<TermMeaning>): TermMeaning => ({
  kind: "entity",
  key: "Person",
  parentKey: "",
  displayName: "",
  description: "",
  hidden: false,
  ...over,
});

const GRAPH: DatabaseSchema = {
  type: "g",
  labels: ["Person", "Movie"],
  relationshipTypes: ["ACTED_IN", "KNOWS"],
  nodeProperties: {
    Person: [
      { name: "name", type: "String" },
      { name: "ssn", type: "String" },
    ],
    Movie: [{ name: "title", type: "String" }],
  },
  relProperties: { ACTED_IN: [{ name: "roles", type: "List" }] },
};

const TABLES: DatabaseSchema = {
  type: "t",
  tables: [
    {
      name: "orders",
      columns: [
        { name: "id", type: "integer", nullable: false },
        { name: "secret", type: "text", nullable: true },
      ],
    },
    {
      name: "audit",
      columns: [{ name: "id", type: "integer", nullable: false }],
    },
  ],
};

describe("hideTerms", () => {
  it("leaves a hidden entity, relationship and property out of a graph schema", () => {
    const out = hideTerms(GRAPH, [
      term({ key: "Movie", hidden: true }),
      term({ kind: "relationship", key: "KNOWS", hidden: true }),
      term({
        kind: "property",
        key: "ssn",
        parentKey: "entity:Person",
        hidden: true,
      }),
    ]);
    expect(out.labels).toEqual(["Person"]);
    expect(out.relationshipTypes).toEqual(["ACTED_IN"]);
    expect(out.nodeProperties).toEqual({
      Person: [{ name: "name", type: "String" }],
    });
    expect(out.relProperties).toEqual(GRAPH.relProperties);
  });

  it("leaves a hidden table, and a hidden column, out of a table schema", () => {
    const out = hideTerms(TABLES, [
      term({ key: "audit", hidden: true }),
      term({
        kind: "property",
        key: "secret",
        parentKey: "entity:orders",
        hidden: true,
      }),
    ]);
    expect(out.tables).toEqual([
      {
        name: "orders",
        columns: [{ name: "id", type: "integer", nullable: false }],
      },
    ]);
  });

  it("keeps a property hidden under one parent where another parent still has it", () => {
    const out = hideTerms(
      {
        ...GRAPH,
        nodeProperties: {
          Person: [{ name: "id", type: "String" }],
          Movie: [{ name: "id", type: "String" }],
        },
      },
      [
        term({
          kind: "property",
          key: "id",
          parentKey: "entity:Person",
          hidden: true,
        }),
      ],
    );
    expect(out.nodeProperties).toEqual({
      Person: [],
      Movie: [{ name: "id", type: "String" }],
    });
  });

  it("returns the schema as it was when nothing is hidden", () => {
    expect(hideTerms(GRAPH, [term({ displayName: "Customer" })])).toEqual(
      GRAPH,
    );
  });
});

describe("meaningOf", () => {
  const terms = [
    term({ key: "Person", displayName: "Customer", description: "Buys" }),
    term({ key: "Movie" }),
    term({ key: "Secret", displayName: "Hush", hidden: true }),
  ];

  it("finds the name and description said about a completion's label", () => {
    expect(meaningOf("Person", terms)).toMatchObject({
      displayName: "Customer",
      description: "Buys",
    });
  });

  it.each([["Movie"], ["Secret"], ["Unknown"]])(
    "has nothing to say about %s (nothing described, hidden, or unknown)",
    (label) => {
      expect(meaningOf(label, terms)).toBeUndefined();
    },
  );
});

describe("termOption", () => {
  const completion = (label: string) => ({ label });
  const render = (label: string, terms: TermMeaning[] | undefined) =>
    termOption(() => terms).render(
      completion(label),
      // The state and view are not read.
      {} as never,
      {} as never,
    );

  it("shows a term's display name and description beside its completion", () => {
    const node = render("Person", [
      term({ displayName: "Customer", description: "Buys things" }),
    ]);
    expect(node?.textContent).toBe("Customer — Buys things");
  });

  it("shows only what was said", () => {
    expect(render("Person", [term({ description: "Buys" })])?.textContent).toBe(
      "Buys",
    );
  });

  it("adds nothing to a completion that has no meaning", () => {
    expect(render("Movie", [term({ displayName: "Customer" })])).toBeNull();
    expect(render("Person", undefined)).toBeNull();
  });
});
