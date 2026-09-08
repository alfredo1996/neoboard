/**
 * TableRenderer — the cell formatter, fed connector-shaped rows (#1636).
 *
 * The table is the app's default widget type and had no test of its own. Its
 * one piece of logic is the cell formatter: null → a muted "null", object →
 * JSON, everything else → String(). Replace the object branch with a bare
 * String(v) and every Neo4j node renders "[object Object]" across the app —
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

type Col = {
  id: string;
  accessorFn: (row: Record<string, unknown>) => unknown;
  cell: (ctx: { getValue: () => unknown }) => React.ReactNode;
};

vi.mock("@neoboard/components", () => ({
  EmptyState: ({ title }: { title?: string }) => <div>{title ?? "empty"}</div>,
  DataGrid: ({
    columns,
    data,
  }: {
    columns: Col[];
    data: Record<string, unknown>[];
  }) => (
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
  ),
  DataGridColumnHeader: ({ title }: { title: string }) => <span>{title}</span>,
  DataGridViewOptions: () => null,
  DataGridPagination: () => null,
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
  it("renders a Neo4j node as its JSON, never as [object Object]", () => {
    render(<TableRenderer data={sparseOrders()} settings={noPaging} />);
    expect(screen.queryByText("[object Object]")).toBeNull();
    expect(cells("customer")[0]).toContain('"name":"Ada Lovelace"');
    expect(cells("customer")[0]).toContain('"labels":["Customer"]');
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

  it("renders a Date cell as readable text without JSON quotes", () => {
    // A pg TIMESTAMP is still a Date when it reaches the renderer. Sending
    // it through the object branch would print the ISO string *with* its
    // JSON quotation marks.
    render(<TableRenderer data={sparseOrders()} settings={noPaging} />);
    const shown = cells("placed_at")[0];
    expect(shown).toContain("2026-09-01");
    expect(shown.startsWith('"')).toBe(false);
  });
});
