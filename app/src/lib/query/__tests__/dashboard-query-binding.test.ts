import { describe, it, expect } from "vitest";
import {
  collectLayoutQueries,
  layoutQueryKey,
  layoutsAllowQuery,
  normalizeQuery,
} from "../dashboard-query-binding";

/**
 * #972: viewers of shared/public dashboards may only execute queries that
 * actually appear in the dashboard's saved layout. Clients send widget
 * query templates verbatim (parameter values travel separately via native
 * binding), so binding is normalized exact-matching.
 *
 * #1822: a query is bound to where the dashboard runs it too: its widget's
 * connection, and the database that widget saves. A widget with no saved
 * database runs on the connection's default, and so does every seed query,
 * which use-seed-query.ts sends without a database.
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
          database: "sales",
          query:
            "SELECT category, SUM(total)\n  FROM orders\n  GROUP BY category",
        },
        {
          id: "w2",
          chartType: "parameter-select",
          connectionId: "c1",
          // Where use-widget-save.ts stores them (#1814).
          settings: {
            chartOptions: {
              parameterType: "select",
              seedQuery: "SELECT DISTINCT region FROM customers",
            },
          },
        },
        {
          id: "w4",
          chartType: "form",
          connectionId: "c1",
          database: "sales",
          query: "INSERT INTO notes (region) VALUES ($param_region)",
          settings: {
            chartOptions: {},
            formFields: [
              {
                id: "f1",
                parameterName: "region",
                parameterType: "select",
                // Saved verbatim from the editor textarea, so often multi-line.
                seedQuery: "SELECT name\n  FROM regions",
              },
            ],
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
          connectionId: "c2",
          query: "MATCH (n:Movie) WHERE n.year > $param_year RETURN n LIMIT 50",
        },
      ],
    },
  ],
};

const ORDERS = "SELECT category, SUM(total) FROM orders GROUP BY category";
const NOTES = "INSERT INTO notes (region) VALUES ($param_region)";
const MOVIES = "MATCH (n:Movie) WHERE n.year > $param_year RETURN n LIMIT 50";
const REGIONS = "SELECT DISTINCT region FROM customers";
const REGION_NAMES = "SELECT name FROM regions";

/** Whether a view-level request may run on `layout`. */
function allowed(request: Parameters<typeof layoutsAllowQuery>[1]): boolean {
  return layoutsAllowQuery([layout], request);
}

describe("normalizeQuery", () => {
  it("collapses whitespace and trims", () => {
    expect(normalizeQuery("  SELECT  1\n\t FROM x  ")).toBe("SELECT 1 FROM x");
  });

  it("is case-sensitive", () => {
    expect(normalizeQuery("SELECT 1")).not.toBe(normalizeQuery("select 1"));
  });
});

describe("collectLayoutQueries", () => {
  it("collects each widget query on its connection and saved database, across pages (#1822)", () => {
    const queries = collectLayoutQueries(layout);
    expect(
      queries.has(
        layoutQueryKey({
          connectionId: "c1",
          query: ORDERS,
          database: "sales",
        }),
      ),
    ).toBe(true);
    expect(
      queries.has(layoutQueryKey({ connectionId: "c2", query: MOVIES })),
    ).toBe(true);
  });

  it("collects parameter-select seed queries on the widget's connection", () => {
    const queries = collectLayoutQueries(layout);
    expect(
      queries.has(layoutQueryKey({ connectionId: "c1", query: REGIONS })),
    ).toBe(true);
  });

  it("collects form field seed queries on the connection default, even when the form saves a database (#1822)", () => {
    const queries = collectLayoutQueries(layout);
    expect(
      queries.has(layoutQueryKey({ connectionId: "c1", query: REGION_NAMES })),
    ).toBe(true);
    expect(
      queries.has(
        layoutQueryKey({
          connectionId: "c1",
          query: REGION_NAMES,
          database: "sales",
        }),
      ),
    ).toBe(false);
  });

  it("collects exactly the widget and seed queries, and no other option strings", () => {
    expect([...collectLayoutQueries(layout)].sort()).toEqual(
      [
        { connectionId: "c1", query: ORDERS, database: "sales" },
        { connectionId: "c1", query: REGIONS },
        { connectionId: "c1", query: NOTES, database: "sales" },
        { connectionId: "c1", query: REGION_NAMES },
        { connectionId: "c2", query: MOVIES },
      ]
        .map(layoutQueryKey)
        .sort(),
    );
  });

  it("ignores a top-level settings.seedQuery, which is never saved", () => {
    const queries = collectLayoutQueries({
      pages: [
        {
          widgets: [
            { connectionId: "c1", settings: { seedQuery: "SELECT 1" } },
          ],
        },
      ],
    });
    expect(queries.size).toBe(0);
  });

  it("tolerates malformed layouts", () => {
    expect(collectLayoutQueries(null).size).toBe(0);
    expect(collectLayoutQueries({}).size).toBe(0);
    expect(collectLayoutQueries({ pages: "nope" }).size).toBe(0);
    expect(collectLayoutQueries({ pages: [{ widgets: [{}] }] }).size).toBe(0);
  });
});

describe("layoutsAllowQuery", () => {
  it("allows a widget query with whitespace differences, on its saved database", () => {
    expect(
      allowed({
        connectionId: "c1",
        query: "SELECT category, SUM(total) FROM orders   GROUP BY category",
        database: "sales",
      }),
    ).toBe(true);
  });

  it("allows a parameterized template verbatim (values travel separately)", () => {
    expect(allowed({ connectionId: "c2", query: MOVIES })).toBe(true);
  });

  it("rejects a query not present in any layout", () => {
    expect(allowed({ connectionId: "c1", query: "SELECT * FROM users" })).toBe(
      false,
    );
    expect(
      allowed({
        connectionId: "c1",
        query: "SELECT * FROM users",
        database: "sales",
      }),
    ).toBe(false);
  });

  it("allows selector and form seed queries at their saved paths (#1814)", () => {
    expect(
      allowed({
        connectionId: "c1",
        query: "SELECT DISTINCT region  FROM customers",
      }),
    ).toBe(true);
    // The stored form seed is multi-line; the submitted one is not.
    expect(allowed({ connectionId: "c1", query: REGION_NAMES })).toBe(true);
  });

  it("rejects a near-miss with extra clauses appended", () => {
    expect(
      allowed({
        connectionId: "c1",
        query:
          "SELECT category, SUM(total) FROM orders GROUP BY category; SELECT password FROM pg_shadow",
        database: "sales",
      }),
    ).toBe(false);
  });

  it("checks all provided layouts", () => {
    const other = {
      pages: [{ widgets: [{ connectionId: "c9", query: "SELECT 42" }] }],
    };
    const request = { connectionId: "c9", query: "SELECT 42" };
    expect(layoutsAllowQuery([layout, other], request)).toBe(true);
    expect(layoutsAllowQuery([], request)).toBe(false);
  });

  describe("on the database its widget saves (#1822)", () => {
    it("rejects a saved query on a database its widget does not save", () => {
      expect(
        allowed({ connectionId: "c1", query: ORDERS, database: "archive" }),
      ).toBe(false);
    });

    it("rejects a saved query sent without its widget's database, which would run on the default", () => {
      expect(allowed({ connectionId: "c1", query: ORDERS })).toBe(false);
    });

    it("rejects any database on a query saved without one, the default's own name included", () => {
      expect(
        allowed({ connectionId: "c2", query: MOVIES, database: "archive" }),
      ).toBe(false);
      expect(
        allowed({ connectionId: "c2", query: MOVIES, database: "neo4j" }),
      ).toBe(false);
    });

    it("rejects any database on a seed query, which runs on the connection default", () => {
      expect(
        allowed({ connectionId: "c1", query: REGIONS, database: "archive" }),
      ).toBe(false);
      expect(
        allowed({ connectionId: "c1", query: REGION_NAMES, database: "sales" }),
      ).toBe(false);
    });

    it("reads an empty database as none, on either side", () => {
      expect(allowed({ connectionId: "c2", query: MOVIES, database: "" })).toBe(
        true,
      );
      const savedEmpty = {
        pages: [
          {
            widgets: [{ connectionId: "c1", query: "SELECT 1", database: "" }],
          },
        ],
      };
      expect(
        layoutsAllowQuery([savedEmpty], {
          connectionId: "c1",
          query: "SELECT 1",
        }),
      ).toBe(true);
    });

    it("compares database names exactly", () => {
      expect(
        allowed({ connectionId: "c1", query: ORDERS, database: "Sales" }),
      ).toBe(false);
      expect(
        allowed({ connectionId: "c1", query: ORDERS, database: " sales" }),
      ).toBe(false);
    });

    it("rejects a saved query on another connection the dashboard names", () => {
      expect(
        allowed({ connectionId: "c2", query: ORDERS, database: "sales" }),
      ).toBe(false);
      expect(allowed({ connectionId: "c1", query: MOVIES })).toBe(false);
    });
  });
});
