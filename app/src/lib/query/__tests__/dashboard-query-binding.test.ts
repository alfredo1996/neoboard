import { describe, it, expect } from "vitest";
import {
  collectLayoutQueries,
  layoutQueryKey,
  layoutsAllowQuery,
} from "../dashboard-query-binding";

/**
 * #972: viewers of shared/public dashboards may only execute queries that
 * actually appear in the dashboard's saved layout. Clients send widget
 * query templates verbatim (parameter values travel separately via native
 * binding), so a request matches only a query's exact saved text.
 *
 * #1822: a query is bound to where the dashboard runs it too: its widget's
 * connection, and the database that widget saves. A widget with no saved
 * database runs on the connection's default, and so does every seed query,
 * which use-seed-query.ts sends without a database.
 */

// Saved verbatim from the editor, so often multi-line.
const ORDERS =
  "SELECT category, SUM(total)\n  FROM orders\n  GROUP BY category";
const NOTES = "INSERT INTO notes (region) VALUES ($param_region)";
const MOVIES = "MATCH (n:Movie) WHERE n.year > $param_year RETURN n LIMIT 50";
const REGIONS = "SELECT DISTINCT region FROM customers";
const REGION_NAMES = "SELECT name\n  FROM regions";

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
          query: ORDERS,
        },
        {
          id: "w2",
          chartType: "parameter-select",
          connectionId: "c1",
          // A table switched to a selector keeps the editor's database, but
          // use-seed-query.ts still sends none (#1822).
          database: "sales",
          // Where use-widget-save.ts stores them (#1814).
          settings: {
            chartOptions: {
              parameterType: "select",
              seedQuery: REGIONS,
            },
          },
        },
        {
          id: "w4",
          chartType: "form",
          connectionId: "c1",
          database: "sales",
          query: NOTES,
          settings: {
            chartOptions: {},
            formFields: [
              {
                id: "f1",
                parameterName: "region",
                parameterType: "select",
                seedQuery: REGION_NAMES,
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
          query: MOVIES,
        },
      ],
    },
  ],
};

/** Whether a view-level request may run on `layout`. */
function allowed(request: Parameters<typeof layoutsAllowQuery>[1]): boolean {
  return layoutsAllowQuery([layout], request);
}

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

  it("collects parameter-select seed queries on the widget's connection, with no database even when the widget saves one (#1822)", () => {
    const queries = collectLayoutQueries(layout);
    expect(
      queries.has(layoutQueryKey({ connectionId: "c1", query: REGIONS })),
    ).toBe(true);
    expect(
      queries.has(
        layoutQueryKey({
          connectionId: "c1",
          query: REGIONS,
          database: "sales",
        }),
      ),
    ).toBe(false);
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
  it("allows a widget query sent as its exact saved text, on its saved database", () => {
    expect(
      allowed({ connectionId: "c1", query: ORDERS, database: "sales" }),
    ).toBe(true);
  });

  it.each([
    [
      "its whitespace collapsed",
      "SELECT category, SUM(total) FROM orders GROUP BY category",
    ],
    [
      "a line break moved",
      "SELECT category,\n  SUM(total) FROM orders\n  GROUP BY category",
    ],
    ["CRLF line breaks", ORDERS.replaceAll("\n", "\r\n")],
    ["a trailing newline", `${ORDERS}\n`],
    ["surrounding spaces", ` ${ORDERS} `],
    ["tabs for indentation", ORDERS.replaceAll("  ", "\t")],
  ])("rejects a widget query sent with %s", (_change, query) => {
    expect(allowed({ connectionId: "c1", query, database: "sales" })).toBe(
      false,
    );
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

  it("allows selector and form seed queries at their saved paths, as their exact saved text (#1814)", () => {
    expect(allowed({ connectionId: "c1", query: REGIONS })).toBe(true);
    expect(allowed({ connectionId: "c1", query: REGION_NAMES })).toBe(true);
  });

  it("rejects a seed query whose text differs from the saved one only in whitespace", () => {
    expect(
      allowed({
        connectionId: "c1",
        query: "SELECT DISTINCT region  FROM customers",
      }),
    ).toBe(false);
    expect(
      allowed({ connectionId: "c1", query: "SELECT name FROM regions" }),
    ).toBe(false);
  });

  it("rejects a near-miss with extra clauses appended", () => {
    expect(
      allowed({
        connectionId: "c1",
        query: `${ORDERS}; SELECT password FROM pg_shadow`,
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
        allowed({ connectionId: "c1", query: REGIONS, database: "sales" }),
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
