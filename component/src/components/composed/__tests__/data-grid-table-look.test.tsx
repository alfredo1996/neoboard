import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect } from "vitest";
import { DataGrid } from "../data-grid";
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

type Dotted = Record<string, number>;

describe("numbers", () => {
  it("formats a numeric column with a separator, right-aligned, tabular", () => {
    grid();
    const cell = cellOf("40,868.59");
    expect(cell.className).toContain("text-right");
    expect(cell.className).toContain("tabular-nums");
    expect(cellOf("2,000.00").className).toContain("text-right");
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
  const bodyRows = () =>
    within(screen.getAllByRole("rowgroup")[1]).getAllByRole("row");

  it("fits 11 rows in 480px, and one fewer under a search box", () => {
    // (480 - 32 - 38) / 36 = 11.4; the search box takes 40 more: 10.3
    const { unmount } = render(
      <DataGrid columns={columns} data={rows} containerHeight={480} />,
    );
    expect(bodyRows()).toHaveLength(11);
    unmount();
    render(
      <DataGrid
        columns={columns}
        data={rows}
        containerHeight={480}
        enableGlobalFilter
      />,
    );
    expect(bodyRows()).toHaveLength(10);
  });
});

describe("fix round (#2222 review)", () => {
  it("reaches the filter field with the arrow keys, and Enter closes the menu", async () => {
    const user = userEvent.setup();
    grid();
    screen.getByRole("button", { name: /^Name/ }).focus();
    await user.keyboard("{Enter}");
    for (let i = 0; i < 5; i++) {
      if (document.activeElement === screen.getByLabelText("Filter Name"))
        break;
      await user.keyboard("{ArrowDown}");
    }
    expect(document.activeElement).toBe(screen.getByLabelText("Filter Name"));
    await user.keyboard("alpha{Enter}");
    expect(screen.queryByRole("menu")).toBeNull();
    expect(screen.getByText(/1–6 of 6, filtered from 50/)).toBeInTheDocument();
  });

  it("labels the filter field in view", async () => {
    const user = userEvent.setup();
    grid();
    await user.click(screen.getByRole("button", { name: /^Name/ }));
    expect(screen.getByText("Filter Name").tagName).toBe("LABEL");
  });

  it("leaves a colour the row sets to the row", () => {
    grid({ getRowStyle: () => ({ color: "rgb(255, 0, 0)" }) });
    expect(cellOf("Alpha 0").className).not.toMatch(/text-foreground/);
    expect(cellOf("40,868.59").className).not.toMatch(/text-foreground/);
  });

  it("keeps a year bare under Automatic with Decimal Places", () => {
    grid({ decimalPlaces: 1 });
    expect(screen.getAllByText("1999").length).toBeGreaterThan(0);
    expect(screen.getByText("2,000.0")).toBeInTheDocument();
  });

  it("filters and searches the text a number shows", async () => {
    const user = userEvent.setup();
    grid({ enableGlobalFilter: true });
    await user.type(screen.getByPlaceholderText("Search 50 rows"), "12,000");
    expect(screen.getByText("12,000.00")).toBeInTheDocument();
    expect(screen.getAllByText(/of 1, filtered from 50/)).toHaveLength(1);
    await user.clear(screen.getByPlaceholderText("Search 50 rows"));
    await user.click(screen.getByRole("button", { name: /^Gross/ }));
    await user.type(screen.getByLabelText("Filter Gross"), "40,868");
    expect(screen.getByText("40,868.59")).toBeInTheDocument();
    expect(screen.getByText(/1–1 of 1, filtered from 50/)).toBeInTheDocument();
  });

  it("does not search an object cell as [object Object], and honours a column's own filterFn", async () => {
    const user = userEvent.setup();
    type R = { node: { label: string } };
    render(
      <DataGrid<R>
        columns={[
          {
            accessorKey: "node",
            header: "Node",
            cell: ({ getValue }) => (getValue() as { label: string }).label,
            filterFn: (row, id, fv) =>
              (row.getValue(id) as { label: string }).label.includes(
                fv as string,
              ),
          },
          { accessorKey: "plain", header: "Plain" } as ColumnDef<R, unknown>,
        ]}
        data={[{ node: { label: "Person" } }, { node: { label: "City" } }]}
        enableGlobalFilter
      />,
    );
    const box = screen.getByPlaceholderText("Search 2 rows");
    await user.type(box, "object");
    expect(screen.getByText("No results.")).toBeInTheDocument();
    await user.clear(box);
    await user.type(box, "Cit");
    expect(screen.getByText("City")).toBeInTheDocument();
    expect(screen.queryByText("Person")).toBeNull();
  });

  it("has no orphan separator when pagination is off and a filter is on", async () => {
    const user = userEvent.setup();
    grid({ enablePagination: false });
    await user.click(screen.getByRole("button", { name: /^Name/ }));
    await user.type(screen.getByLabelText("Filter Name"), "alpha");
    await user.keyboard("{Escape}");
    const clear = screen.getByRole("button", { name: "Clear filters" });
    expect(clear.parentElement!.firstElementChild).toBe(clear);
  });

  it("right-aligns an aggregated figure, formatted like the column", () => {
    render(
      <DataGrid
        columns={[
          { accessorKey: "g", header: "G" },
          { accessorKey: "gross", header: "Gross", aggregationFn: "sum" },
        ]}
        data={[
          { g: "a", gross: 1000 },
          { g: "a", gross: 2500.5 },
        ]}
        enableGrouping
        initialGrouping={["g"]}
      />,
    );
    const cell = screen.getByText("3,500.5").closest("td")!;
    expect(cell.className).toContain("text-right");
    expect(cell.className).toContain("tabular-nums");
  });

  it("hiding a column clears its filter and its sort", async () => {
    const user = userEvent.setup();
    grid();
    await user.click(screen.getByRole("button", { name: /^Name/ }));
    await user.type(screen.getByLabelText("Filter Name"), "alpha");
    await user.click(screen.getByRole("menuitem", { name: "Sort ascending" }));
    await user.click(screen.getByRole("button", { name: /^Name/ }));
    await user.click(screen.getByRole("menuitem", { name: "Hide column" }));
    expect(screen.queryByText(/filtered from/)).toBeNull();
    await user.click(screen.getByRole("button", { name: "Show all" }));
    expect(screen.getByRole("columnheader", { name: /Name/ })).toHaveAttribute(
      "aria-sort",
      "none",
    );
  });

  it("formats a numeric string past 2^53 in a numeric column", () => {
    render(
      <DataGrid
        columns={[{ accessorKey: "n", header: "N" }]}
        data={[{ n: "9007199254740993" }, { n: 5 }]}
      />,
    );
    expect(screen.getByText("9,007,199,254,740,993")).toBeInTheDocument();
  });

  it("gives a column the most decimals its values carry, capped at 2", () => {
    render(
      <DataGrid
        columns={[
          { accessorKey: "a", header: "A" },
          { accessorKey: "b", header: "B" },
          { accessorKey: "c", header: "C" },
        ]}
        data={[
          { a: 12345.7, b: 18, c: 0.12345 },
          { a: 1234.57, b: 20, c: 300 },
          { a: 100, b: 3, c: 1 },
        ]}
      />,
    );
    for (const t of [
      "12,345.70",
      "1,234.57",
      "100.00",
      "300.00",
      "18",
      "20",
      "0.12",
      "1.00",
    ]) {
      expect(screen.getByText(t)).toBeInTheDocument();
    }
  });

  it("prints an aggregated figure with the column's decimals", () => {
    render(
      <DataGrid
        columns={[
          { accessorKey: "g", header: "G" },
          { accessorKey: "gross", header: "Gross", aggregationFn: "sum" },
        ]}
        data={[
          { g: "a", gross: 0.25 },
          { g: "a", gross: 0.75 },
        ]}
        enableGrouping
        initialGrouping={["g"]}
      />,
    );
    expect(screen.getByText("1.00")).toBeInTheDocument();
  });

  it("matches the year/id rule on the part after the last dot", () => {
    render(
      <DataGrid
        columns={[
          { id: "m.year", accessorFn: (r: Dotted) => r["m.year"], header: "Y" },
          { id: "n.ID", accessorFn: (r: Dotted) => r["n.ID"], header: "I" },
          {
            id: "p.customer_id",
            accessorFn: (r: Dotted) => r["p.customer_id"],
            header: "C",
          },
          {
            id: "m.count",
            accessorFn: (r: Dotted) => r["m.count"],
            header: "K",
          },
        ]}
        data={[
          {
            "m.year": 1999,
            "n.ID": 12001,
            "p.customer_id": 22001,
            "m.count": 31000,
          },
        ]}
      />,
    );
    for (const t of ["1999", "12001", "22001", "31,000"]) {
      expect(screen.getByText(t)).toBeInTheDocument();
    }
  });
});
