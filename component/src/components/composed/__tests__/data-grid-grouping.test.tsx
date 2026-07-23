import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect } from "vitest";
import { DataGrid } from "../data-grid";
import type { ColumnDef } from "@tanstack/react-table";

interface SalesRow {
  country: string;
  city: string;
  department: string;
  revenue: number;
  headcount: number;
}

const columns: ColumnDef<SalesRow, unknown>[] = [
  { accessorKey: "country", header: "Country" },
  { accessorKey: "city", header: "City" },
  { accessorKey: "department", header: "Department" },
  { accessorKey: "revenue", header: "Revenue" },
  { accessorKey: "headcount", header: "Headcount" },
];

const data: SalesRow[] = [
  {
    country: "US",
    city: "New York",
    department: "Sales",
    revenue: 100,
    headcount: 5,
  },
  {
    country: "US",
    city: "New York",
    department: "Engineering",
    revenue: 200,
    headcount: 10,
  },
  {
    country: "US",
    city: "Chicago",
    department: "Sales",
    revenue: 80,
    headcount: 3,
  },
  {
    country: "UK",
    city: "London",
    department: "Sales",
    revenue: 150,
    headcount: 7,
  },
  {
    country: "UK",
    city: "London",
    department: "Engineering",
    revenue: 300,
    headcount: 15,
  },
  {
    country: "UK",
    city: "Manchester",
    department: "HR",
    revenue: 50,
    headcount: 2,
  },
];

// userEvent-driven tests dispatch ~8 events, each yielding a macrotask. In CI the
// 4 packages' coverage suites run in parallel (see .github/workflows/ci.yml),
// oversubscribing the runner and starving those macrotasks so these tests creep
// toward the default 5s testTimeout and flake. Give them headroom here.
// ponytail: raising the timeout tolerates the oversubscription; the real root cause
// is that parallel fan-out — bound it in ci.yml if this flakiness spreads.
const SLOW_UI_TIMEOUT_MS = 15000;

describe("DataGrid grouping", () => {
  it("renders group rows when grouping is enabled", () => {
    render(
      <DataGrid
        columns={columns}
        data={data}
        enableGrouping
        initialGrouping={["country"]}
        enablePagination={false}
      />,
    );
    // Group rows should contain the group value
    expect(screen.getByText(/US/)).toBeInTheDocument();
    expect(screen.getByText(/UK/)).toBeInTheDocument();
  });

  it(
    "collapses and expands groups on click",
    async () => {
      const user = userEvent.setup({ delay: null });
      render(
        <DataGrid
          columns={columns}
          data={data}
          enableGrouping
          initialGrouping={["country"]}
          enablePagination={false}
        />,
      );
      // All rows should be visible initially (groups expanded by default)
      await waitFor(() => {
        expect(screen.getAllByRole("row").length).toBeGreaterThan(2);
      });

      // Click the first group toggle to collapse
      const toggles = await screen.findAllByRole("button", {
        name: /toggle group/i,
      });
      expect(toggles.length).toBeGreaterThan(0);
      await user.click(toggles[0]);

      // After collapsing, fewer rows should be visible
      await waitFor(() => {
        const rowsAfterCollapse = screen.getAllByRole("row");
        // Header + collapsed group + remaining group rows
        expect(rowsAfterCollapse.length).toBeLessThan(data.length + 3);
      });
    },
    SLOW_UI_TIMEOUT_MS,
  );

  it("shows aggregation values in group header rows", () => {
    const columnsWithAgg: ColumnDef<SalesRow, unknown>[] = [
      { accessorKey: "country", header: "Country" },
      { accessorKey: "city", header: "City" },
      { accessorKey: "department", header: "Department" },
      {
        accessorKey: "revenue",
        header: "Revenue",
        aggregationFn: "sum",
        aggregatedCell: ({ getValue }) => `Total: ${getValue()}`,
      },
      { accessorKey: "headcount", header: "Headcount" },
    ];
    render(
      <DataGrid
        columns={columnsWithAgg}
        data={data}
        enableGrouping
        initialGrouping={["country"]}
        enablePagination={false}
      />,
    );
    // US: 100+200+80=380, UK: 150+300+50=500
    expect(screen.getByText("Total: 380")).toBeInTheDocument();
    expect(screen.getByText("Total: 500")).toBeInTheDocument();
  });

  it("supports multi-level grouping", () => {
    render(
      <DataGrid
        columns={columns}
        data={data}
        enableGrouping
        initialGrouping={["country", "city"]}
        enablePagination={false}
      />,
    );
    // Should have both country and city group rows
    expect(screen.getByText(/US/)).toBeInTheDocument();
    expect(screen.getByText(/New York/)).toBeInTheDocument();
    expect(screen.getByText(/Chicago/)).toBeInTheDocument();
    expect(screen.getByText(/UK/)).toBeInTheDocument();
    expect(screen.getByText(/London/)).toBeInTheDocument();
  });

  it(
    "renders expand/collapse all toggle",
    async () => {
      const user = userEvent.setup({ delay: null });
      render(
        <DataGrid
          columns={columns}
          data={data}
          enableGrouping
          initialGrouping={["country"]}
          enablePagination={false}
        />,
      );
      const collapseAllBtn = screen.getByRole("button", {
        name: /collapse all/i,
      });
      expect(collapseAllBtn).toBeInTheDocument();
      await user.click(collapseAllBtn);

      // After collapsing all, only header + group header rows remain
      // 1 header row + 2 group rows (US, UK) = 3 total
      const rows = screen.getAllByRole("row");
      expect(rows.length).toBe(3);
    },
    SLOW_UI_TIMEOUT_MS,
  );

  it("shows row count in group header", () => {
    render(
      <DataGrid
        columns={columns}
        data={data}
        enableGrouping
        initialGrouping={["country"]}
        enablePagination={false}
      />,
    );
    // US has 3 rows, UK has 3 rows — both show (3)
    const counts = screen.getAllByText("(3)");
    expect(counts).toHaveLength(2);
  });

  it("produces different aggregated values for different aggregation functions", () => {
    // Render with sum aggregation
    const makeColumns = (aggFn: string): ColumnDef<SalesRow, unknown>[] => [
      { accessorKey: "country", header: "Country" },
      {
        accessorKey: "revenue",
        header: "Revenue",
        aggregationFn: aggFn as "sum" | "mean" | "count",
        aggregatedCell: ({ getValue }) => {
          const v = getValue();
          return v != null
            ? `${aggFn}: ${typeof v === "number" ? v : String(v)}`
            : null;
        },
      },
    ];

    // Sum: US = 100+200+80 = 380
    const { unmount: u1 } = render(
      <DataGrid
        key="grp-sum"
        columns={makeColumns("sum")}
        data={data}
        enableGrouping
        initialGrouping={["country"]}
        enablePagination={false}
      />,
    );
    expect(screen.getByText("sum: 380")).toBeInTheDocument();
    u1();

    // Count: US has 3 rows
    const { unmount: u2 } = render(
      <DataGrid
        key="grp-count"
        columns={makeColumns("count")}
        data={data}
        enableGrouping
        initialGrouping={["country"]}
        enablePagination={false}
      />,
    );
    // Both US and UK have 3 rows
    expect(screen.getAllByText("count: 3")).toHaveLength(2);
    u2();

    // Mean: US = 380/3 ≈ 126.67
    render(
      <DataGrid
        key="grp-mean"
        columns={makeColumns("mean")}
        data={data}
        enableGrouping
        initialGrouping={["country"]}
        enablePagination={false}
      />,
    );
    // Mean of [100, 200, 80] = 126.666...
    const meanCell = screen.getByText(/mean: 126/);
    expect(meanCell).toBeInTheDocument();
  });

  it("does not show grouping UI when enableGrouping is false", () => {
    render(
      <DataGrid
        columns={columns}
        data={data}
        enableGrouping={false}
        enablePagination={false}
      />,
    );
    expect(
      screen.queryByRole("button", { name: /toggle group/i }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /collapse all/i }),
    ).not.toBeInTheDocument();
  });
});
