/**
 * #1662 — the sort comparator must not depend on which rows a sample hits.
 *
 * TanStack's `sortingFn: "auto"` judges a column from `flatRows.slice(10)`
 * — every row AFTER the tenth (not the first ten, as the issue first read
 * it). A table of ten rows or fewer, or a column whose values past row ten
 * are all null, samples nothing and falls through to `basic`, which compares
 * strings by code unit: "10" < "100" < "9", and "Zebra" before "apple".
 * DataGrid now infers each column's kind from the whole column.
 */
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ColumnDef } from "@tanstack/react-table";
import { DataGrid } from "../data-grid";
import { DataGridColumnHeader } from "../data-grid-column-header";

type Row = { label: string; v: unknown };

const columns: ColumnDef<Row, unknown>[] = [
  { accessorKey: "label", header: "Label" },
  {
    accessorKey: "v",
    header: ({ column }) => <DataGridColumnHeader column={column} title="V" />,
  },
];

const rows = (values: unknown[]): Row[] =>
  values.map((v, i) => ({ label: `r${i}`, v }));

/** Sort the V column via the header's dropdown, the only path a user has. */
async function sortV(
  user: ReturnType<typeof userEvent.setup>,
  dir: "Asc" | "Desc",
) {
  await user.click(screen.getByRole("button", { name: /^V$/ }));
  await user.click(await screen.findByRole("menuitem", { name: dir }));
}

/** The V cells top to bottom, skipping the header row. */
const shownV = () =>
  screen
    .getAllByRole("row")
    .slice(1)
    .map((r) => r.querySelectorAll("td")[1]?.textContent ?? "");

describe("#1662 — sort comparator from the whole column", () => {
  it("sorts numeric strings numerically in a table of fewer than ten rows", async () => {
    const user = userEvent.setup();
    render(
      <DataGrid
        columns={columns}
        data={rows(["100", "9", "10"])}
        enableSorting
      />,
    );
    await sortV(user, "Asc");
    expect(shownV()).toEqual(["9", "10", "100"]);
  });

  it("sorts text case-insensitively in a table of fewer than ten rows", async () => {
    const user = userEvent.setup();
    render(
      <DataGrid
        columns={columns}
        data={rows(["banana", "Zebra", "apple"])}
        enableSorting
      />,
    );
    await sortV(user, "Asc");
    expect(shownV()).toEqual(["apple", "banana", "Zebra"]);
  });

  it("does not fall back to code-unit order when every value past row ten is null", async () => {
    const user = userEvent.setup();
    // Ten numeric strings, then two nulls: the sample `auto` takes is empty.
    const data = rows([
      "100",
      "9",
      "10",
      "2",
      "30",
      "4",
      "50",
      "6",
      "70",
      "8",
      null,
      null,
    ]);
    render(
      <DataGrid
        columns={columns}
        data={data}
        enableSorting
        enablePagination={false}
      />,
    );
    await sortV(user, "Asc");
    const shown = shownV().filter((v) => v !== "");
    expect(shown).toEqual([
      "2",
      "4",
      "6",
      "8",
      "9",
      "10",
      "30",
      "50",
      "70",
      "100",
    ]);
  });

  it("still sorts a numeric column numerically when its first ten rows are null (the issue's case — already correct, kept as a guard)", async () => {
    const user = userEvent.setup();
    const data = rows([...Array<null>(10).fill(null), 10, 9, 100]);
    render(
      <DataGrid
        columns={columns}
        data={data}
        enableSorting
        enablePagination={false}
      />,
    );
    await sortV(user, "Asc");
    const shown = shownV().filter((v) => v !== "");
    // Numeric cells are formatted ("9.00"); the order is what matters.
    expect(shown.map(Number)).toEqual([9, 10, 100]);
  });
});
