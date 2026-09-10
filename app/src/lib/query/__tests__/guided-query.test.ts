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
  it("binds a number only for a numeric field", () => {
    expect(coerceFilterValue("2000", "Long")).toBe(2000);
    expect(coerceFilterValue("2000", "INTEGER")).toBe(2000);
    expect(coerceFilterValue("2000", "integer")).toBe(2000);
    expect(coerceFilterValue("-1.5", "Double")).toBe(-1.5);
    expect(coerceFilterValue("1.5", "double precision")).toBe(1.5);
    expect(coerceFilterValue("007", "bigint")).toBe(7);
    // Not a number a user means as one.
    expect(coerceFilterValue("2000 AD", "Long")).toBe("2000 AD");
    expect(coerceFilterValue("0x10", "Long")).toBe("0x10");
    expect(coerceFilterValue("1e3", "Long")).toBe("1e3");
    expect(coerceFilterValue("", "Long")).toBe("");
  });

  it("leaves an integer past 2^53 as text rather than a rounded number", () => {
    expect(coerceFilterValue("12345678901234567890", "numeric")).toBe(
      "12345678901234567890",
    );
    expect(coerceFilterValue("9007199254740991", "bigint")).toBe(
      9007199254740991,
    );
  });

  it("binds a boolean only for a boolean field", () => {
    expect(coerceFilterValue("true", "Boolean")).toBe(true);
    expect(coerceFilterValue("false", "boolean")).toBe(false);
    expect(coerceFilterValue("yes", "Boolean")).toBe("yes");
  });

  // #1717 — a string field holding digits must bind a string, or nothing
  // matches: '1999' = 1999 is false in Cypher, '02139' is not 2139 in SQL.
  it("keeps text for a string field, or a field of unknown type", () => {
    expect(coerceFilterValue("1999", "String")).toBe("1999");
    expect(coerceFilterValue("02139", "text")).toBe("02139");
    expect(coerceFilterValue("02139", "character varying")).toBe("02139");
    expect(coerceFilterValue("12345678901234567890", "String")).toBe(
      "12345678901234567890",
    );
    expect(coerceFilterValue("true", "String")).toBe("true");
    expect(coerceFilterValue("2000")).toBe("2000");
  });
});

describe("picksToSpec", () => {
  const sources = [
    {
      name: "Movie",
      fields: ["title", "released"],
      types: { title: "String", released: "Long" },
    },
  ];
  const picks = { ...EMPTY_PICKS, source: "Movie", fields: ["title"] };

  it("is undefined until a source is picked", () => {
    expect(picksToSpec(EMPTY_PICKS, sources)).toBeUndefined();
  });

  it("carries source, fields and limit, with no filter when no field is set", () => {
    expect(picksToSpec(picks, sources)).toEqual({
      source: "Movie",
      fields: ["title"],
      filter: undefined,
      limit: 100,
    });
  });

  it("coerces the filter value by the field's declared type", () => {
    expect(
      picksToSpec(
        {
          ...picks,
          filter: { field: "released", op: ">", value: "2000" },
          limit: 10,
        },
        sources,
      ),
    ).toEqual({
      source: "Movie",
      fields: ["title"],
      filter: { field: "released", op: ">", value: 2000 },
      limit: 10,
    });
    expect(
      picksToSpec(
        { ...picks, filter: { field: "title", op: "=", value: "1999" } },
        sources,
      )?.filter,
    ).toEqual({ field: "title", op: "=", value: "1999" });
  });

  it("keeps a contains value as text, whatever the field holds", () => {
    expect(
      picksToSpec(
        { ...picks, filter: { field: "released", op: "contains", value: "19" } },
        sources,
      )?.filter,
    ).toEqual({ field: "released", op: "contains", value: "19" });
  });
});
