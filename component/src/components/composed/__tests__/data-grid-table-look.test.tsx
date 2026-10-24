import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect } from "vitest";
import { DataGrid, calcDynamicPageSize } from "../data-grid";
import type { ColumnDef } from "@tanstack/react-table";

/** #2222 — 36px rows, aligned numbers, header menu, footer pager. */

interface Row {
  name: string;
  gross: number;
  year: number;
  user_id: number;
}

const columns: ColumnDef<Row, unknown>[] = [
  { accessorKey: "name", header: "Name" },
  { accessorKey: "gross", header: "Gross" },
  { accessorKey: "year", header: "Year" },
  { accessorKey: "user_id", header: "User_ID" },
];

const rows: Row[] = Array.from({ length: 50 }, (_, i) => ({
  name: i < 6 ? `Alpha ${i}` : `Beta ${i}`,
  gross: i === 0 ? 40868.59 : (i + 1) * 1000,
  year: 1999 + (i % 3),
  user_id: 12000 + i,
}));

const grid = (
  props: Partial<React.ComponentProps<typeof DataGrid<Row>>> = {},
) =>
  render(
    <DataGrid
      columns={columns}
      data={rows}
      enableSorting
      pageSize={10}
      {...props}
    />,
  );

const cellOf = (text: string) => screen.getByText(text).closest("td")!;

describe("numbers", () => {
  it("formats a numeric column with a separator, right-aligned, tabular", () => {
    grid();
    const cell = cellOf("40,868.59");
    expect(cell.className).toContain("text-right");
    expect(cell.className).toContain("tabular-nums");
    expect(cellOf("2,000").className).toContain("text-right");
  });

  it("prints a year, id and *_id column without a separator, still right-aligned", () => {
    grid();
    expect(screen.getAllByText("1999")[0].closest("td")!.className).toContain(
      "text-right",
    );
    expect(cellOf("12001").className).toContain("text-right");
    expect(screen.queryByText("12,001")).not.toBeInTheDocument();
  });

  it("right-aligns a numeric column's header", () => {
    grid();
    expect(
      screen.getByRole("columnheader", { name: /Gross/ }).className,
    ).toContain("text-right");
  });

  it("keeps a year bare under a comma format saved before Automatic existed", () => {
    grid({ numberFormat: "comma", decimalPlaces: 2 });
    expect(screen.getAllByText("1999").length).toBeGreaterThan(0);
    expect(screen.getByText("40,868.59")).toBeInTheDocument();
    expect(screen.getByText("2,000.00")).toBeInTheDocument();
  });

  it("lets the widget's number format win", () => {
    grid({ numberFormat: "plain", decimalPlaces: 0 });
    expect(screen.queryByText("40,868.59")).not.toBeInTheDocument();
    expect(screen.getByText("40869")).toBeInTheDocument();
  });
});

describe("header menu", () => {
  it("filters the rows from the menu's field, and shows a funnel", async () => {
    const user = userEvent.setup();
    grid();
    await user.click(screen.getByRole("button", { name: /^Name/ }));
    await user.type(screen.getByLabelText("Filter Name"), "alpha");
    expect(screen.getByText("Alpha 3")).toBeInTheDocument();
    expect(screen.queryByText("Beta 20")).not.toBeInTheDocument();
    expect(screen.getByText(/1–6 of 6, filtered from 50/)).toBeInTheDocument();
    await user.keyboard("{Escape}");
    expect(
      screen
        .getByRole("button", { name: /^Name/ })
        .querySelector("[data-filtered]"),
    ).not.toBeNull();
    await user.click(screen.getByRole("button", { name: "Clear filters" }));
    expect(screen.getByText("1–10 of 50")).toBeInTheDocument();
  });

  it("shows the arrow only on the sorted column and keeps aria-sort", async () => {
    const user = userEvent.setup();
    grid();
    const header = (name: RegExp) => screen.getByRole("columnheader", { name });
    expect(header(/Gross/).querySelector("[data-sort-icon]")).toBeNull();
    await user.click(screen.getByRole("button", { name: /^Gross/ }));
    await user.click(screen.getByRole("menuitem", { name: "Sort descending" }));
    expect(header(/Gross/)).toHaveAttribute("aria-sort", "descending");
    expect(header(/Gross/).querySelector("[data-sort-icon]")).not.toBeNull();
    expect(header(/Name/).querySelector("[data-sort-icon]")).toBeNull();
    await user.click(screen.getByRole("button", { name: /^Gross/ }));
    await user.click(screen.getByRole("menuitem", { name: "Clear sort" }));
    expect(header(/Gross/)).toHaveAttribute("aria-sort", "none");
  });

  it("hides a column, and Show all in the footer brings it back", async () => {
    const user = userEvent.setup();
    grid();
    await user.click(screen.getByRole("button", { name: /^Year/ }));
    await user.click(screen.getByRole("menuitem", { name: "Hide column" }));
    expect(screen.queryByRole("columnheader", { name: /Year/ })).toBeNull();
    expect(screen.getByText(/1 column hidden/)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Show all" }));
    expect(
      screen.getByRole("columnheader", { name: /Year/ }),
    ).toBeInTheDocument();
  });

  it("still offers Filter and Hide when sorting is off", async () => {
    const user = userEvent.setup();
    grid({ enableSorting: false });
    await user.click(screen.getByRole("button", { name: /^Name/ }));
    expect(screen.getByLabelText("Filter Name")).toBeInTheDocument();
    expect(
      screen.queryByRole("menuitem", { name: "Sort ascending" }),
    ).toBeNull();
    expect(
      screen.getByRole("menuitem", { name: "Hide column" }),
    ).toBeInTheDocument();
  });
});

describe("pager", () => {
  it("reads 1–10 of 50, then 11–20 of 50 after Next", async () => {
    const user = userEvent.setup();
    grid();
    expect(screen.getByText("1–10 of 50")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Next" }));
    expect(screen.getByText("11–20 of 50")).toBeInTheDocument();
    expect(screen.queryByText(/Page \d/)).toBeNull();
  });
});

describe("search box", () => {
  it("is absent unless enabled", () => {
    grid();
    expect(screen.queryByPlaceholderText(/^Search/)).toBeNull();
  });

  it("searches every visible column", async () => {
    const user = userEvent.setup();
    grid({ enableGlobalFilter: true });
    const box = screen.getByPlaceholderText("Search 50 rows");
    await user.type(box, "Alpha 4");
    const body = screen.getAllByRole("rowgroup")[1];
    expect(within(body).getAllByRole("row")).toHaveLength(1);
    await user.clear(box);
    await user.type(box, "40868");
    expect(screen.getByText("40,868.59")).toBeInTheDocument();
  });
});

describe("page size from the container", () => {
  it("uses the 32px header and the footer height", () => {
    // (480 - 32 - 38) / 36 = 11.4; the old heights gave 10
    expect(calcDynamicPageSize(480)).toBe(11);
  });
});
