/**
 * TableRenderer through the real DataGrid: what a column filter keeps and
 * what a sort orders (#2070).
 *
 * TanStack reads the accessor's raw value, so an object column filtered on
 * "[object Object]" (a title matched nothing, "object" matched every row) and
 * sorted every value as equal. It now filters and sorts on the text its cells
 * show. A column of primitives keeps the grid's own filter and comparators.
 */
import { describe, it, expect, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import React from "react";

vi.mock("@neoboard/components", async () => {
  const { DataGrid } = await vi.importActual<
    typeof import("@neoboard/components/composed")
  >("@neoboard/components/composed");
  return {
    DataGrid,
    // The real header sorts from a Radix menu that jsdom cannot open. This
    // calls the same toggleSorting, so the grid's comparators stay real.
    DataGridColumnHeader: ({
      column,
      title,
    }: {
      column: { toggleSorting: (desc: boolean) => void };
      title: string;
    }) => <button onClick={() => column.toggleSorting(false)}>{title}</button>,
    DataGridViewOptions: () => null,
    DataGridPagination: () => null,
    EmptyState: ({ title }: { title?: string }) => <div>{title}</div>,
    parseColorThresholds: () => [],
    resolveThresholdColor: () => undefined,
    interpolateColor: () => "#000000",
    contrastTextColor: () => "#ffffff",
  };
});

import { TableRenderer } from "../table-renderer";

const node = (id: string, labels: string[], properties: object) => ({
  $type: "node",
  identity: id,
  elementId: `4:db:${id}`,
  labels,
  properties,
});

const matrix = node("1", ["Movie"], { title: "The Matrix" });
const atlas = node("2", ["Movie"], { title: "Cloud Atlas" });
const keanu = node("3", ["Person"], { name: "Keanu Reeves" });

const settings = { enablePagination: false, enableColumnFilters: true };

/** Each body row's cell text in `column`, top to bottom. */
const shown = (column: number) =>
  Array.from(document.querySelectorAll("tbody tr")).map(
    (tr) => tr.querySelectorAll("td")[column]?.textContent ?? "",
  );

const filter = (column: string, text: string) =>
  fireEvent.change(screen.getByLabelText(`Filter ${column}`), {
    target: { value: text },
  });

describe("TableRenderer filters and sorts through the grid (#2070)", () => {
  it("filters a node column by a property value, keeping the matching rows only", () => {
    render(
      <TableRenderer
        data={[{ m: matrix }, { m: atlas }, { m: keanu }]}
        settings={settings}
      />,
    );
    filter("m", "matrix");
    expect(shown(0)).toEqual([':Movie {title: "The Matrix"}']);
  });

  it("matches nothing when a node column is filtered by 'object'", () => {
    render(
      <TableRenderer
        data={[{ m: matrix }, { m: atlas }]}
        settings={settings}
      />,
    );
    filter("m", "object");
    expect(screen.getByText("No results.")).toBeInTheDocument();
  });

  it("filters a row without the column as the null its cell shows", () => {
    // Rows cross JSON, so a missing value arrives as a missing key.
    render(
      <TableRenderer
        data={[{ m: matrix }, { m: null }, {}]}
        settings={settings}
      />,
    );
    filter("m", "null");
    expect(shown(0)).toEqual(["null", "null"]);
  });

  it("sorts a node column by the text its cells show", () => {
    render(
      <TableRenderer
        data={[{ m: keanu }, { m: matrix }, { m: atlas }]}
        settings={settings}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "m" }));
    expect(shown(0)).toEqual([
      ':Movie {title: "Cloud Atlas"}',
      ':Movie {title: "The Matrix"}',
      ':Person {name: "Keanu Reeves"}',
    ]);
  });

  it("still sorts a number column numerically", () => {
    render(
      <TableRenderer
        data={[{ n: 10 }, { n: 9 }, { n: 100 }]}
        settings={settings}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "n" }));
    expect(shown(0)).toEqual(["9", "10", "100"]);
  });

  it("still filters a string column case-insensitively", () => {
    render(
      <TableRenderer
        data={[{ s: "Alice" }, { s: "bob" }, { s: "Malik" }]}
        settings={settings}
      />,
    );
    filter("s", "ALI");
    expect(shown(0)).toEqual(["Alice", "Malik"]);
  });
});
