/**
 * TableRenderer — the cell formatter, fed connector-shaped rows (#1636).
 *
 * The table is the app's default widget type and had no test of its own. Its
 * one piece of logic is the cell formatter: null → a muted "null", a tagged
 * graph value → its labels or type and properties (#2050), any other object →
 * JSON, everything else → String(). Replace the object branch with a bare
 * String(v) and every graph node renders "[object Object]" across the app —
 * this file is what fails when that happens.
 *
 * DataGrid is stubbed to a plain table that pushes every row through the real
 * `column.cell`, so what is asserted is the formatter TableRenderer builds,
 * not the grid.
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import React from "react";
import {
  sparseOrders,
  numericString,
} from "@/__tests__/fixtures/connector-output";

type GridRow = { getValue: (columnId: string) => unknown };

type Col = {
  id: string;
  accessorFn: (row: Record<string, unknown>) => unknown;
  cell: (ctx: { getValue: () => unknown }) => React.ReactNode;
  getGroupingValue?: (row: Record<string, unknown>) => unknown;
  filterFn?: (row: GridRow, columnId: string, filterValue: unknown) => boolean;
  sortingFn?: (a: GridRow, b: GridRow, columnId: string) => number;
};

// The column defs the last render handed the grid, for the grouping, filter
// and sort hooks the stub itself never calls.
const grid = vi.hoisted(() => ({ columns: [] as Col[] }));

vi.mock("@neoboard/components", () => ({
  EmptyState: ({ title }: { title?: string }) => <div>{title ?? "empty"}</div>,
  DataGrid: ({
    columns,
    data,
    pagination,
  }: {
    columns: Col[];
    data: Record<string, unknown>[];
    pagination?: (table: unknown) => React.ReactNode;
  }) => {
    grid.columns = columns;
    return (
      <>
        {pagination?.({})}
        <table>
          <tbody>
            {data.map((row, i) => (
              <tr key={i}>
                {columns.map((c) => (
                  <td key={c.id} data-col={c.id}>
                    {c.cell({ getValue: () => c.accessorFn(row) })}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </>
    );
  },
  DataGridColumnHeader: ({ title }: { title: string }) => <span>{title}</span>,
  DataGridViewOptions: () => <div data-testid="view-options" />,
  DataGridPagination: () => <div data-testid="pager" />,
  parseColorThresholds: () => [],
  resolveThresholdColor: () => undefined,
  interpolateColor: () => "#000000",
  contrastTextColor: () => "#ffffff",
}));

import { TableRenderer } from "../table-renderer";

// With pagination on, TableRenderer renders nothing until a ResizeObserver
// measurement arrives; the stubbed observer never fires one. The formatter
// under test is the same either way.
const noPaging = { enablePagination: false };

const cells = (col: string) =>
  Array.from(document.querySelectorAll(`td[data-col="${col}"]`)).map(
    (td) => td.textContent ?? "",
  );

describe("TableRenderer cell formatting (#1636)", () => {
  it("renders a graph node as text, never as [object Object]", () => {
    render(<TableRenderer data={sparseOrders()} settings={noPaging} />);
    expect(screen.queryByText("[object Object]")).toBeNull();
    expect(cells("customer")[0]).toContain('name: "Ada Lovelace"');
    expect(cells("customer")[0]).toContain(":Customer");
  });

  it("renders a null cell as a muted null, not as an empty cell", () => {
    render(<TableRenderer data={sparseOrders()} settings={noPaging} />);
    // note is null on rows 0 and 2; customer on row 2; total and shipped_on on row 1.
    expect(cells("note")[0]).toBe("null");
    expect(cells("customer")[2]).toBe("null");
    expect(cells("total")[1]).toBe("null");
  });

  it("renders a numeric string exactly as the database sent it", () => {
    render(<TableRenderer data={sparseOrders()} settings={noPaging} />);
    expect(cells("total")[0]).toBe(numericString);
  });

  it("renders a date-time cell as readable text without JSON quotes", () => {
    // A date-time reaches the renderer as an ISO-8601 string (#1904). Sending
    // it through the object branch would print it *with* its JSON quotation
    // marks.
    render(<TableRenderer data={sparseOrders()} settings={noPaging} />);
    const shown = cells("placed_at")[0];
    expect(shown).toContain("2026-09-01");
    expect(shown.startsWith('"')).toBe(false);
  });
});

// The SDK's canonical shapes, tagged by `$type` (#1904, #1925).
const node = (
  id: string,
  labels: string[],
  properties: Record<string, unknown>,
) => ({
  $type: "node",
  identity: id,
  elementId: `4:db:${id}`,
  labels,
  properties,
});

const rel = (
  type: string,
  from: { elementId: string },
  to: { elementId: string },
  properties: Record<string, unknown> = {},
) => ({
  $type: "relationship",
  identity: `${from.elementId}-${to.elementId}`,
  elementId: `5:db:${type}`,
  type,
  properties,
  start: from.elementId,
  startNodeElementId: from.elementId,
  end: to.elementId,
  endNodeElementId: to.elementId,
});

const keanu = node("1", ["Person", "Actor"], {
  name: "Keanu Reeves",
  born: 1964,
});
const matrix = node("2", ["Movie"], { title: "The Matrix", released: 1999 });
const lana = node("3", ["Person"], { name: "Lana Wachowski" });

const one = (v: unknown) => {
  render(<TableRenderer data={[{ v }]} settings={noPaging} />);
  return cells("v")[0];
};

describe("TableRenderer graph cells (#2050)", () => {
  it("renders a node as its labels and properties", () => {
    const shown = one(
      node("9", ["Movie"], {
        title: "Cloud Atlas",
        released: 2012,
        restricted: false,
        genres: ["Drama", "Sci-Fi"],
        meta: { rated: "R" },
      }),
    );
    expect(shown).toBe(
      ':Movie {title: "Cloud Atlas", released: 2012, restricted: false, genres: ["Drama","Sci-Fi"], meta: {"rated":"R"}}',
    );
  });

  it("never shows $type or elementId", () => {
    const shown = one(keanu);
    expect(shown).toBe(':Person:Actor {name: "Keanu Reeves", born: 1964}');
    expect(shown).not.toContain("$type");
    expect(shown).not.toContain("elementId");
    expect(shown).not.toContain("4:db:");
  });

  it("drops an empty property map, and an empty node reads as {}", () => {
    render(
      <TableRenderer
        data={[{ v: node("7", ["Genre"], {}) }, { v: node("8", [], {}) }]}
        settings={noPaging}
      />,
    );
    expect(cells("v")).toEqual([":Genre", "{}"]);
  });

  it("renders a relationship as its type and properties", () => {
    render(
      <TableRenderer
        data={[
          { v: rel("ACTED_IN", keanu, matrix, { roles: ["Neo"] }) },
          { v: rel("DIRECTED", lana, matrix) },
        ]}
        settings={noPaging}
      />,
    );
    expect(cells("v")).toEqual(['[:ACTED_IN {roles: ["Neo"]}]', "[:DIRECTED]"]);
  });

  it("renders a path as its chain, each arrow the relationship's own direction", () => {
    // Traversal: Keanu → The Matrix → Lana. The second hop walks DIRECTED
    // against its direction, so its arrow points back at the traversal.
    const shown = one({
      $type: "path",
      start: keanu,
      end: lana,
      segments: [
        {
          start: keanu,
          relationship: rel("ACTED_IN", keanu, matrix),
          end: matrix,
        },
        {
          start: matrix,
          relationship: rel("DIRECTED", lana, matrix),
          end: lana,
        },
      ],
      length: 2,
    });
    expect(shown).toBe(
      '(:Person:Actor {name: "Keanu Reeves", born: 1964})-[:ACTED_IN]->' +
        '(:Movie {title: "The Matrix", released: 1999})<-[:DIRECTED]-' +
        '(:Person {name: "Lana Wachowski"})',
    );
    expect(shown).not.toContain("$type");
  });

  it("renders a zero-length path as its one node", () => {
    const shown = one({
      $type: "path",
      start: lana,
      end: lana,
      segments: [],
      length: 0,
    });
    expect(shown).toBe('(:Person {name: "Lana Wachowski"})');
  });

  it("keeps JSON for an untagged object that has labels and properties keys", () => {
    // A JSON column, not a node: the tag is the only signal (#1925).
    const shown = one({ labels: ["Movie"], properties: { title: "X" } });
    expect(shown).toBe('{"labels":["Movie"],"properties":{"title":"X"}}');
  });

  it("keeps JSON for a tagged value that is not the shape it claims", () => {
    // A JSON column holding a `$type` key: data, and must not crash the table.
    expect(one({ $type: "node" })).toBe('{"$type":"node"}');
  });

  it("leaves arrays and primitives unchanged", () => {
    render(
      <TableRenderer
        data={[{ v: ["a", 1] }, { v: 42 }, { v: true }, { v: "plain" }]}
        settings={noPaging}
      />,
    );
    expect(cells("v")).toEqual(['["a",1]', "42", "true", "plain"]);
  });

  it("reads a graph value inside a list or map as its text, a node in parentheses", () => {
    // `collect(m)`, `nodes(p)`, `{m: m}`: the owner's "never shown" holds
    // inside JSON too. The brackets and separators stay JSON's.
    render(
      <TableRenderer
        data={[
          { v: [keanu, matrix] },
          { v: { m: matrix, r: rel("DIRECTED", lana, matrix), n: 1 } },
        ]}
        settings={noPaging}
      />,
    );
    const shown = cells("v");
    expect(shown).toEqual([
      '[(:Person:Actor {name: "Keanu Reeves", born: 1964}),(:Movie {title: "The Matrix", released: 1999})]',
      '{"m":(:Movie {title: "The Matrix", released: 1999}),"r":[:DIRECTED],"n":1}',
    ]);
    for (const text of shown) {
      expect(text).not.toContain("$type");
      expect(text).not.toContain("elementId");
    }
  });
});

describe("TableRenderer groups, filters and sorts a graph column by its text (#2050)", () => {
  // TanStack reads the accessor's raw value: every node grouped under
  // "[object Object]" (one group, headed by the first node), the filter
  // matched "object", and the sort saw every node as equal.
  const column = (data: Record<string, unknown>[]) => {
    render(<TableRenderer data={data} settings={noPaging} />);
    return grid.columns[0];
  };
  const row = (v: unknown): GridRow => ({ getValue: () => v });

  it("groups each node under the text its cell shows", () => {
    const col = column([{ v: keanu }, { v: matrix }]);
    expect(col.getGroupingValue?.({ v: keanu })).toBe(
      ':Person:Actor {name: "Keanu Reeves", born: 1964}',
    );
    expect(col.getGroupingValue?.({ v: matrix })).toBe(
      ':Movie {title: "The Matrix", released: 1999}',
    );
  });

  it("filters on the text its cell shows, case-insensitively", () => {
    const col = column([{ v: keanu }]);
    expect(col.filterFn?.(row(keanu), "v", "person")).toBe(true);
    expect(col.filterFn?.(row(keanu), "v", "Keanu")).toBe(true);
    expect(col.filterFn?.(row(keanu), "v", "object")).toBe(false);
  });

  it("sorts on the text its cell shows", () => {
    const col = column([{ v: keanu }, { v: matrix }]);
    // ":Movie …" before ":Person …"
    expect(col.sortingFn?.(row(matrix), row(keanu), "v")).toBeLessThan(0);
    expect(col.sortingFn?.(row(keanu), row(matrix), "v")).toBeGreaterThan(0);
  });

  it("leaves a column of primitives to the grid's own grouping, filter and sort", () => {
    const col = column([{ n: 10 }, { n: 9 }]);
    expect(col.getGroupingValue).toBeUndefined();
    expect(col.filterFn).toBeUndefined();
    expect(col.sortingFn).toBeUndefined();
  });
});

describe("TableRenderer footer with pagination off (#1861)", () => {
  // With pagination off DataGrid pages by Number.MAX_SAFE_INTEGER, so a pager
  // read "Rows per page 9007199254740991, Page 1 of 1".
  it("keeps the column options but renders no pager", () => {
    render(<TableRenderer data={[{ a: 1 }]} settings={noPaging} />);
    expect(screen.getByTestId("view-options")).toBeInTheDocument();
    expect(screen.queryByTestId("pager")).not.toBeInTheDocument();
  });

  it("still renders the pager when pagination is on", () => {
    // jsdom measures every element as 0px tall, which keeps a paged table
    // waiting for a height; give the wrapper a real one.
    const rect = vi
      .spyOn(HTMLElement.prototype, "getBoundingClientRect")
      .mockReturnValue({ height: 400 } as DOMRect);
    try {
      render(<TableRenderer data={[{ a: 1 }]} settings={{}} />);
      expect(screen.getByTestId("view-options")).toBeInTheDocument();
      expect(screen.getByTestId("pager")).toBeInTheDocument();
    } finally {
      rect.mockRestore();
    }
  });
});
