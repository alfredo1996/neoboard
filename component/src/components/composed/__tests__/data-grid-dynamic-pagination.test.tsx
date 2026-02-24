import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect } from "vitest";
import type { ColumnDef } from "@tanstack/react-table";
import {
  DataGrid,
  calcDynamicPageSize,
  DATA_GRID_HEADER_HEIGHT,
  DATA_GRID_ROW_HEIGHT,
  DATA_GRID_PAGINATION_HEIGHT,
} from "../data-grid";

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
});
