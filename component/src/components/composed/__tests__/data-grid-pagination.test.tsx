import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect } from "vitest";
import type { ColumnDef } from "@tanstack/react-table";
import { DataGrid } from "../data-grid";
import { DataGridPagination } from "../data-grid-pagination";

interface TestRow {
  id: number;
  name: string;
}

const columns: ColumnDef<TestRow, unknown>[] = [
  { accessorKey: "name", header: "Name" },
];

const data: TestRow[] = Array.from({ length: 25 }, (_, i) => ({
  id: i + 1,
  name: `User ${i + 1}`,
}));

describe("DataGridPagination", () => {
  it("renders rows per page selector", () => {
    render(
      <DataGrid
        columns={columns}
        data={data}
        pageSize={10}
        pagination={(table) => <DataGridPagination table={table} />}
      />
    );
    expect(screen.getByText("Rows per page")).toBeInTheDocument();
  });

  it("renders page info", () => {
    render(
      <DataGrid
        columns={columns}
        data={data}
        pageSize={10}
        pagination={(table) => <DataGridPagination table={table} />}
      />
    );
    expect(screen.getByText("Page 1 of 3")).toBeInTheDocument();
  });

  it("navigates to next page", async () => {
    const user = userEvent.setup();
    render(
      <DataGrid
        columns={columns}
        data={data}
        pageSize={10}
        pagination={(table) => <DataGridPagination table={table} />}
      />
    );
    await user.click(screen.getByRole("button", { name: "Go to next page" }));
    expect(screen.getByText("Page 2 of 3")).toBeInTheDocument();
  });

  it("navigates to previous page", async () => {
    const user = userEvent.setup();
    render(
      <DataGrid
        columns={columns}
        data={data}
        pageSize={10}
        pagination={(table) => <DataGridPagination table={table} />}
      />
    );
    await user.click(screen.getByRole("button", { name: "Go to next page" }));
    await user.click(screen.getByRole("button", { name: "Go to previous page" }));
    expect(screen.getByText("Page 1 of 3")).toBeInTheDocument();
  });

  it("disables previous button on first page", () => {
    render(
      <DataGrid
        columns={columns}
        data={data}
        pageSize={10}
        pagination={(table) => <DataGridPagination table={table} />}
      />
    );
    expect(screen.getByRole("button", { name: "Go to previous page" })).toBeDisabled();
  });
});
