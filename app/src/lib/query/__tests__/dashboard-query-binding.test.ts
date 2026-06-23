import { describe, it, expect } from "vitest";
import {
  collectLayoutQueries,
  layoutsAllowQuery,
  normalizeQuery,
} from "../dashboard-query-binding";

/**
 * #972: viewers of shared/public dashboards may only execute queries that
 * actually appear in the dashboard's saved layout. Clients send widget
 * query templates verbatim (parameter values travel separately via native
 * binding), so binding is normalized exact-matching.
 */

const layout = {
  version: 2,
  pages: [
    {
      id: "p1",
      title: "Page 1",
      widgets: [
        {
          id: "w1",
          chartType: "bar",
          connectionId: "c1",
          query:
            "SELECT category, SUM(total)\n  FROM orders\n  GROUP BY category",
        },
        {
          id: "w2",
          chartType: "parameter-select",
          connectionId: "c1",
          settings: {
            seedQuery: "SELECT DISTINCT region FROM customers",
          },
        },
      ],
    },
    {
      id: "p2",
      title: "Page 2",
      widgets: [
        {
          id: "w3",
          chartType: "table",
          connectionId: "c1",
          query: "MATCH (n:Movie) WHERE n.year > $param_year RETURN n LIMIT 50",
        },
      ],
    },
  ],
};

describe("normalizeQuery", () => {
  it("collapses whitespace and trims", () => {
    expect(normalizeQuery("  SELECT  1\n\t FROM x  ")).toBe("SELECT 1 FROM x");
  });

  it("is case-sensitive", () => {
    expect(normalizeQuery("SELECT 1")).not.toBe(normalizeQuery("select 1"));
  });
});

describe("collectLayoutQueries", () => {
  it("collects widget queries across all pages", () => {
    const queries = collectLayoutQueries(layout);
    expect(queries.has(normalizeQuery(layout.pages[0].widgets[0].query!))).toBe(
      true,
    );
    expect(queries.has(normalizeQuery(layout.pages[1].widgets[0].query!))).toBe(
      true,
    );
  });

  it("collects parameter-select seed queries", () => {
    const queries = collectLayoutQueries(layout);
    expect(queries.has("SELECT DISTINCT region FROM customers")).toBe(true);
  });

  it("tolerates malformed layouts", () => {
    expect(collectLayoutQueries(null).size).toBe(0);
    expect(collectLayoutQueries({}).size).toBe(0);
    expect(collectLayoutQueries({ pages: "nope" }).size).toBe(0);
    expect(collectLayoutQueries({ pages: [{ widgets: [{}] }] }).size).toBe(0);
  });
});

describe("layoutsAllowQuery", () => {
  it("allows a widget query with whitespace differences", () => {
    const submitted =
      "SELECT category, SUM(total) FROM orders   GROUP BY category";
    expect(layoutsAllowQuery([layout], submitted)).toBe(true);
  });

  it("allows a parameterized template verbatim (values travel separately)", () => {
    expect(
      layoutsAllowQuery(
        [layout],
        "MATCH (n:Movie) WHERE n.year > $param_year RETURN n LIMIT 50",
      ),
    ).toBe(true);
  });

  it("rejects a query not present in any layout", () => {
    expect(layoutsAllowQuery([layout], "SELECT * FROM users")).toBe(false);
  });

  it("rejects a near-miss with extra clauses appended", () => {
    expect(
      layoutsAllowQuery(
        [layout],
        "SELECT category, SUM(total) FROM orders GROUP BY category; SELECT password FROM pg_shadow",
      ),
    ).toBe(false);
  });

  it("checks all provided layouts", () => {
    const other = {
      pages: [{ widgets: [{ query: "SELECT 42" }] }],
    };
    expect(layoutsAllowQuery([layout, other], "SELECT 42")).toBe(true);
    expect(layoutsAllowQuery([], "SELECT 42")).toBe(false);
  });
});
