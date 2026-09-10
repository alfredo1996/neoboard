import { describe, it, expect } from "vitest";
import {
  GUIDED_CHART_TYPES,
  coerceFilterValue,
  picksToSpec,
  queryBuilderFor,
} from "../guided-query";
import { EMPTY_PICKS } from "@neoboard/components/lib/guided-query";

// #1696 — the app's pure half of the guided builder: which connectors and
// chart types get it, and how the picker's raw picks become a QuerySpec.

describe("queryBuilderFor", () => {
  it("resolves the built-in builders by connector type and nothing else", () => {
    expect(queryBuilderFor("neo4j")).toBeTypeOf("function");
    expect(queryBuilderFor("postgresql")).toBeTypeOf("function");
    expect(queryBuilderFor("mongo")).toBeUndefined();
    expect(queryBuilderFor(undefined)).toBeUndefined();
  });

  it("produces the connector's own dialect", () => {
    expect(
      queryBuilderFor("neo4j")?.({ source: "Movie", fields: ["title"] }).query,
    ).toBe("MATCH (n:Movie)\nRETURN n.title AS title");
    expect(
      queryBuilderFor("postgresql")?.({ source: "movies", fields: ["title"] })
        .query,
    ).toBe('SELECT "title"\nFROM "movies"');
  });
});

describe("GUIDED_CHART_TYPES", () => {
  it("covers the tabular charts and leaves graph/map/json/form to experts", () => {
    expect([...GUIDED_CHART_TYPES].sort()).toEqual(
      ["bar", "line", "pie", "single-value", "table"].sort(),
    );
  });
});

describe("coerceFilterValue", () => {
  it("binds numbers and booleans as such and everything else as text", () => {
    expect(coerceFilterValue("2000")).toBe(2000);
    expect(coerceFilterValue("-1.5")).toBe(-1.5);
    expect(coerceFilterValue("true")).toBe(true);
    expect(coerceFilterValue("false")).toBe(false);
    expect(coerceFilterValue("2000 AD")).toBe("2000 AD");
    expect(coerceFilterValue("")).toBe("");
    // Not a JS number literal a user means as one.
    expect(coerceFilterValue("0x10")).toBe("0x10");
    expect(coerceFilterValue("1e3")).toBe("1e3");
  });
});

describe("picksToSpec", () => {
  it("is undefined until a source is picked", () => {
    expect(picksToSpec(EMPTY_PICKS)).toBeUndefined();
  });

  it("carries source, fields and limit, with no filter when no field is set", () => {
    expect(
      picksToSpec({ ...EMPTY_PICKS, source: "Movie", fields: ["title"] }),
    ).toEqual({ source: "Movie", fields: ["title"], filter: undefined, limit: 100 });
  });

  it("coerces the filter value", () => {
    expect(
      picksToSpec({
        ...EMPTY_PICKS,
        source: "Movie",
        fields: ["title"],
        filter: { field: "released", op: ">", value: "2000" },
        limit: 10,
      }),
    ).toEqual({
      source: "Movie",
      fields: ["title"],
      filter: { field: "released", op: ">", value: 2000 },
      limit: 10,
    });
  });
});
