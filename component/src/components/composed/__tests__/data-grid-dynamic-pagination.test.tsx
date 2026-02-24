import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi } from "vitest";
import type { ColumnDef, Table } from "@tanstack/react-table";
import {
  DataGrid,
  calcDynamicPageSize,
  DATA_GRID_HEADER_HEIGHT,
  DATA_GRID_ROW_HEIGHT,
  DATA_GRID_PAGINATION_HEIGHT,
} from "../data-grid";
import { getChartOptions, getDefaultChartSettings } from "../chart-options-schema";

// ---------------------------------------------------------------------------
// calcDynamicPageSize unit tests
// ---------------------------------------------------------------------------
describe("calcDynamicPageSize", () => {
  it("returns at least 1 even when the container is tiny", () => {
    expect(calcDynamicPageSize(1)).toBe(1);
  });

  it("returns 1 for a container exactly large enough for the chrome but zero rows", () => {
    // Exactly header + pagination, no room for rows → clamped to 1
    const tinyHeight = DATA_GRID_HEADER_HEIGHT + DATA_GRID_PAGINATION_HEIGHT;
    expect(calcDynamicPageSize(tinyHeight)).toBe(1);
  });

  it("returns 1 for zero container height", () => {
    expect(calcDynamicPageSize(0)).toBe(1);
  });

  it("returns 1 for negative container height", () => {
    expect(calcDynamicPageSize(-200)).toBe(1);
  });

  it("returns 1 when container fits chrome plus less than one full row", () => {
    // One pixel short of a complete row after chrome
    const height =
      DATA_GRID_HEADER_HEIGHT + DATA_GRID_PAGINATION_HEIGHT + DATA_GRID_ROW_HEIGHT - 1;
    expect(calcDynamicPageSize(height)).toBe(1);
  });

  it("returns 1 when container fits chrome plus exactly one row", () => {
    const height =
      DATA_GRID_HEADER_HEIGHT + DATA_GRID_PAGINATION_HEIGHT + DATA_GRID_ROW_HEIGHT;
    expect(calcDynamicPageSize(height)).toBe(1);
  });

  it("calculates correctly with no toolbar", () => {
    // e.g. 400px container, no toolbar
    const height = 400;
    const expected = Math.max(
      1,
      Math.floor(
        (height - DATA_GRID_HEADER_HEIGHT - DATA_GRID_PAGINATION_HEIGHT) /
          DATA_GRID_ROW_HEIGHT,
      ),
    );
    expect(calcDynamicPageSize(height)).toBe(expected);
  });

  it("accounts for toolbar height", () => {
    const height = 400;
    const toolbarHeight = 40;
    const expected = Math.max(
      1,
      Math.floor(
        (height - toolbarHeight - DATA_GRID_HEADER_HEIGHT - DATA_GRID_PAGINATION_HEIGHT) /
          DATA_GRID_ROW_HEIGHT,
      ),
    );
    expect(calcDynamicPageSize(height, toolbarHeight)).toBe(expected);
  });

  it("toolbar=0 default matches explicit 0", () => {
    expect(calcDynamicPageSize(500)).toBe(calcDynamicPageSize(500, 0));
  });

  it("returns more rows for a larger container", () => {
    const small = calcDynamicPageSize(300);
    const large = calcDynamicPageSize(600);
    expect(large).toBeGreaterThan(small);
  });

  it("is deterministic — same inputs produce the same output", () => {
    expect(calcDynamicPageSize(500, 40)).toBe(calcDynamicPageSize(500, 40));
  });

  it("rounds down (does not show a partial row)", () => {
    // Choose a height that would give a fractional row count
    const availableForRows = 2.8 * DATA_GRID_ROW_HEIGHT;
    const height =
      availableForRows + DATA_GRID_HEADER_HEIGHT + DATA_GRID_PAGINATION_HEIGHT;
    expect(calcDynamicPageSize(height)).toBe(2);
  });

  it("toolbar larger than container still returns 1", () => {
    expect(calcDynamicPageSize(50, 200)).toBe(1);
  });

  it("large container yields proportionally more rows", () => {
    const height = 1000;
    const expected = Math.max(
      1,
      Math.floor(
        (height - DATA_GRID_HEADER_HEIGHT - DATA_GRID_PAGINATION_HEIGHT) /
          DATA_GRID_ROW_HEIGHT,
      ),
    );
    expect(calcDynamicPageSize(height)).toBe(expected);
    expect(calcDynamicPageSize(height)).toBeGreaterThan(1);
  });

  it("exported height constants are positive integers", () => {
    expect(DATA_GRID_HEADER_HEIGHT).toBeGreaterThan(0);
    expect(DATA_GRID_ROW_HEIGHT).toBeGreaterThan(0);
    expect(DATA_GRID_PAGINATION_HEIGHT).toBeGreaterThan(0);
    expect(Number.isInteger(DATA_GRID_HEADER_HEIGHT)).toBe(true);
    expect(Number.isInteger(DATA_GRID_ROW_HEIGHT)).toBe(true);
    expect(Number.isInteger(DATA_GRID_PAGINATION_HEIGHT)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// DataGrid integration tests for enablePagination / containerHeight
// ---------------------------------------------------------------------------
interface TestRow {
  id: number;
  name: string;
}

const columns: ColumnDef<TestRow, unknown>[] = [
  { accessorKey: "name", header: "Name" },
];

// 30 rows so we can verify page-size effects
const manyRows: TestRow[] = Array.from({ length: 30 }, (_, i) => ({
  id: i + 1,
  name: `User ${i + 1}`,
}));

describe("DataGrid — enablePagination", () => {
  it("shows all rows when enablePagination is false", () => {
    render(
      <DataGrid
        columns={columns}
        data={manyRows}
        enablePagination={false}
        pageSize={10}
      />,
    );
    // All 30 rows should be visible; no pagination controls
    expect(screen.getByText("User 1")).toBeInTheDocument();
    expect(screen.getByText("User 30")).toBeInTheDocument();
    expect(screen.queryByText(/^Page \d+ of \d+$/)).not.toBeInTheDocument();
  });

  it("paginates when enablePagination is true (default)", () => {
    render(<DataGrid columns={columns} data={manyRows} pageSize={10} />);
    const rows = screen.getAllByText(/^User \d+$/);
    expect(rows).toHaveLength(10);
    expect(screen.getByText("Page 1 of 3")).toBeInTheDocument();
  });

  it("uses containerHeight to compute page size when provided", () => {
    // A 400px container with no toolbar.
    // calcDynamicPageSize(400, 0) = Math.floor((400-40-52)/36) = Math.floor(308/36) = Math.floor(8.5) = 8
    const dynamicSize = calcDynamicPageSize(400, 0);

    render(
      <DataGrid
        columns={columns}
        data={manyRows}
        enablePagination
        containerHeight={400}
        pageSize={20} // should be overridden by the dynamic calculation
      />,
    );

    const rows = screen.getAllByText(/^User \d+$/);
    expect(rows).toHaveLength(dynamicSize);
  });

  it("falls back to pageSize prop when containerHeight is not provided", () => {
    render(
      <DataGrid columns={columns} data={manyRows} enablePagination pageSize={5} />,
    );
    const rows = screen.getAllByText(/^User \d+$/);
    expect(rows).toHaveLength(5);
  });

  it("falls back to pageSize prop when containerHeight is 0", () => {
    // containerHeight=0 does not satisfy the `> 0` guard in effectivePageSize;
    // the explicit pageSize prop is used instead.
    render(
      <DataGrid
        columns={columns}
        data={manyRows}
        enablePagination
        containerHeight={0}
        pageSize={7}
      />,
    );
    const rows = screen.getAllByText(/^User \d+$/);
    expect(rows).toHaveLength(7);
  });

  it("navigation still works with dynamic page size", async () => {
    const user = userEvent.setup();
    // 400px → 8 rows per page → 30 rows → 4 pages
    const dynamicSize = calcDynamicPageSize(400, 0);
    const expectedPages = Math.ceil(30 / dynamicSize);

    render(
      <DataGrid
        columns={columns}
        data={manyRows}
        enablePagination
        containerHeight={400}
      />,
    );

    expect(screen.getByText(`Page 1 of ${expectedPages}`)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Next" }));
    expect(screen.getByText(`Page 2 of ${expectedPages}`)).toBeInTheDocument();
  });

  it("previous page button navigates back to the first page", async () => {
    const user = userEvent.setup();
    render(<DataGrid columns={columns} data={manyRows} pageSize={10} />);

    // Advance to page 2
    await user.click(screen.getByRole("button", { name: "Next" }));
    expect(screen.getByText("Page 2 of 3")).toBeInTheDocument();

    // Navigate back
    await user.click(screen.getByRole("button", { name: "Previous" }));
    expect(screen.getByText("Page 1 of 3")).toBeInTheDocument();
    expect(screen.getByText("User 1")).toBeInTheDocument();
  });

  it("does not show pagination when enablePagination is false even with many rows", () => {
    render(
      <DataGrid
        columns={columns}
        data={manyRows}
        enablePagination={false}
      />,
    );
    expect(screen.queryByRole("button", { name: "Next" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Previous" })).not.toBeInTheDocument();
  });

  it("does not show built-in pagination when a custom pagination render prop is supplied", () => {
    const customPagination = vi.fn((_table: Table<TestRow>) => (
      <div data-testid="custom-pagination">custom controls</div>
    ));

    render(
      <DataGrid
        columns={columns}
        data={manyRows}
        pageSize={10}
        pagination={customPagination}
      />,
    );

    // Custom render prop is rendered
    expect(screen.getByTestId("custom-pagination")).toBeInTheDocument();
    // Built-in controls are suppressed
    expect(screen.queryByText(/^Page \d+ of \d+$/)).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Next" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Previous" })).not.toBeInTheDocument();
    // The render prop was called with the table instance
    expect(customPagination).toHaveBeenCalled();
  });

  it("does not show built-in pagination when all rows fit on a single page", () => {
    // 3 rows, pageSize=10 → only 1 page → no controls
    const fewRows = manyRows.slice(0, 3);
    render(
      <DataGrid columns={columns} data={fewRows} enablePagination pageSize={10} />,
    );
    expect(screen.queryByRole("button", { name: "Next" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Previous" })).not.toBeInTheDocument();
    expect(screen.queryByText(/^Page \d+ of \d+$/)).not.toBeInTheDocument();
  });

  it("select-all header checkbox selects all rows on the current page", async () => {
    const user = userEvent.setup();
    const onSelectionChange = vi.fn();

    render(
      <DataGrid
        columns={columns}
        data={manyRows}
        enablePagination
        enableSelection
        pageSize={10}
        onSelectionChange={onSelectionChange}
      />,
    );

    // Index 0 is the "select all" header checkbox
    const checkboxes = screen.getAllByRole("checkbox");
    await user.click(checkboxes[0]);

    expect(onSelectionChange).toHaveBeenCalled();
    const selected =
      onSelectionChange.mock.calls[onSelectionChange.mock.calls.length - 1][0] as TestRow[];
    // All 10 visible page rows should be selected
    expect(selected).toHaveLength(10);
  });

  it("shows selection count text when rows are selected with pagination active", async () => {
    const user = userEvent.setup();
    render(
      <DataGrid
        columns={columns}
        data={manyRows}
        enablePagination
        enableSelection
        pageSize={10}
      />,
    );

    const checkboxes = screen.getAllByRole("checkbox");
    // Select the first data row (index 1; 0 is header)
    await user.click(checkboxes[1]);

    expect(screen.getByText(/1 of 30 row\(s\) selected\./)).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// chart-options-schema — table widget must expose enablePagination
// ---------------------------------------------------------------------------
describe("chart-options-schema table widget enablePagination option", () => {
  it("table options include an enablePagination key", () => {
    const keys = getChartOptions("table").map((o) => o.key);
    expect(keys).toContain("enablePagination");
  });

  it("enablePagination option has boolean type", () => {
    const opt = getChartOptions("table").find((o) => o.key === "enablePagination");
    expect(opt).toBeDefined();
    expect(opt?.type).toBe("boolean");
  });

  it("enablePagination default is true", () => {
    const opt = getChartOptions("table").find((o) => o.key === "enablePagination");
    expect(opt?.default).toBe(true);
  });

  it("getDefaultChartSettings returns enablePagination=true for table", () => {
    const defaults = getDefaultChartSettings("table");
    expect(defaults.enablePagination).toBe(true);
  });

  it("enablePagination option is in the Pagination category", () => {
    const opt = getChartOptions("table").find((o) => o.key === "enablePagination");
    expect(opt?.category).toBe("Pagination");
  });
});
