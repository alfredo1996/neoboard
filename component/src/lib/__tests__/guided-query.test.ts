import { describe, it, expect } from "vitest";
import {
  guidedSources,
  withSource,
  EMPTY_PICKS,
  GUIDED_FILTER_OPS,
} from "../guided-query";
import type { DatabaseSchema } from "../schema-transforms";

// #1696 — the guided builder's pure half: what a schema offers as sources
// and how the picks react to a source change.

const neo4j: DatabaseSchema = {
  type: "neo4j",
  labels: ["Movie", "Person"],
  relationshipTypes: ["ACTED_IN"],
  nodeProperties: {
    Movie: [
      { name: "title", type: "String" },
      { name: "released", type: "Integer" },
    ],
    // A property-less label arrives with a null-named property (#1714).
    Person: [{ name: null as unknown as string, type: "null" }],
  },
  relProperties: { ACTED_IN: [{ name: "roles", type: "List" }] },
};

const postgres: DatabaseSchema = {
  type: "postgresql",
  tables: [
    {
      name: "movies",
      columns: [
        { name: "title", type: "text", nullable: false },
        { name: "released", type: "integer", nullable: true },
      ],
    },
    { name: "people", columns: [] },
  ],
};

describe("guidedSources", () => {
  it("offers node labels with their properties, not relationship types", () => {
    expect(guidedSources(neo4j)).toEqual([
      { name: "Movie", fields: ["title", "released"] },
      { name: "Person", fields: [] },
    ]);
  });

  it("offers tables with their columns", () => {
    expect(guidedSources(postgres)).toEqual([
      { name: "movies", fields: ["title", "released"] },
      { name: "people", fields: [] },
    ]);
  });

  it("is empty without a schema", () => {
    expect(guidedSources(undefined)).toEqual([]);
    expect(guidedSources({ type: "neo4j" })).toEqual([]);
  });
});

describe("withSource", () => {
  it("drops the fields and filter of the previous source", () => {
    const picks = {
      source: "Movie",
      fields: ["title"],
      filter: { field: "released", op: ">" as const, value: "2000" },
      limit: 50,
    };
    expect(withSource(picks, "Person")).toEqual({
      source: "Person",
      fields: [],
      filter: { field: "", op: ">", value: "2000" },
      limit: 50,
    });
  });

  it("keeps everything when the source does not change", () => {
    const picks = { ...EMPTY_PICKS, source: "Movie", fields: ["title"] };
    expect(withSource(picks, "Movie")).toBe(picks);
  });
});

describe("GUIDED_FILTER_OPS", () => {
  it("lists the operators every builder understands", () => {
    expect(GUIDED_FILTER_OPS).toEqual([
      "=",
      "!=",
      ">",
      ">=",
      "<",
      "<=",
      "contains",
    ]);
  });
});
