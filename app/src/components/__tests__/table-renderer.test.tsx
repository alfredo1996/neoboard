/**
 * TableRenderer — the cell formatter, fed connector-shaped rows (#1636).
 *
 * The table is the app's default widget type and had no test of its own. Its
 * one piece of logic is the cell formatter: null → a muted "null", anything
 * else → `formatCell`'s text (component/src/lib/cell-text.ts, #2102). Render
 * a bare String(v) instead and every graph node reads "[object Object]"
 * across the app — this file is what fails when that happens.
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

type Col = {
  id: string;
  accessorFn: (row: Record<string, unknown>) => unknown;
  cell: (ctx: { getValue: () => unknown }) => React.ReactNode;
  getGroupingValue?: (row: Record<string, unknown>) => unknown;
};

// The column defs the last render handed the grid, for the grouping hook the
// stub itself never calls. Filtering and sorting run through the real grid in
// table-renderer-grid.test.tsx (#2070).
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

const keanu = node("1", ["Person", "Actor"], {
  name: "Keanu Reeves",
  born: 1964,
});
const matrix = node("2", ["Movie"], { title: "The Matrix", released: 1999 });

// The graph formatting cases moved with formatCell to
// component/src/lib/__tests__/cell-text.test.ts (#2102).

describe("TableRenderer groups a graph column by its text (#2050)", () => {
  // TanStack reads the accessor's raw value: every node grouped under
  // "[object Object]", one group headed by the first node.
  const column = (data: Record<string, unknown>[]) => {
    render(<TableRenderer data={data} settings={noPaging} />);
    return grid.columns[0];
  };

  it("groups each node under the text its cell shows", () => {
    const col = column([{ v: keanu }, { v: matrix }]);
    expect(col.getGroupingValue?.({ v: keanu })).toBe(
      ':Person:Actor {name: "Keanu Reeves", born: 1964}',
    );
    expect(col.getGroupingValue?.({ v: matrix })).toBe(
      ':Movie {title: "The Matrix", released: 1999}',
    );
  });

  it("leaves a column of primitives to the grid's own grouping", () => {
    expect(column([{ n: 10 }, { n: 9 }]).getGroupingValue).toBeUndefined();
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
