import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect } from "vitest";
import type { ColumnDef } from "@tanstack/react-table";
import { DataGrid } from "../data-grid";
import { DataGridToolbar } from "../data-grid-toolbar";

interface TestRow {
  name: string;
  email: string;
  status: string;
}

const columns: ColumnDef<TestRow, unknown>[] = [
  { accessorKey: "name", header: "Name" },
  { accessorKey: "email", header: "Email" },
  { accessorKey: "status", header: "Status" },
];

const data: TestRow[] = [
  { name: "Alice", email: "alice@example.com", status: "Active" },
  { name: "Bob", email: "bob@example.com", status: "Inactive" },
  { name: "Charlie", email: "charlie@example.com", status: "Active" },
];

describe("DataGridToolbar", () => {
  it("renders search input", () => {
    render(
      <DataGrid
        columns={columns}
        data={data}
        enableGlobalFilter
        toolbar={(table) => <DataGridToolbar table={table} />}
      />
    );
    expect(screen.getByPlaceholderText("Search...")).toBeInTheDocument();
  });

  it("renders search input with column key filter", () => {
    render(
      <DataGrid
        columns={columns}
        data={data}
        enableColumnFilters
        toolbar={(table) => (
          <DataGridToolbar
            table={table}
            searchKey="email"
            searchPlaceholder="Filter emails..."
          />
        )}
      />
    );
    expect(screen.getByPlaceholderText("Filter emails...")).toBeInTheDocument();
  });

  it("renders view options button", () => {
    render(
      <DataGrid
        columns={columns}
        data={data}
        toolbar={(table) => <DataGridToolbar table={table} />}
      />
    );
    expect(screen.getByRole("button", { name: /view/i })).toBeInTheDocument();
  });

  it("filters data when typing in global search", async () => {
    const user = userEvent.setup();
    render(
      <DataGrid
        columns={columns}
        data={data}
        enableGlobalFilter
        toolbar={(table) => <DataGridToolbar table={table} />}
      />
    );
    const input = screen.getByPlaceholderText("Search...");
    await user.type(input, "alice");
    expect(screen.getByText("Alice")).toBeInTheDocument();
    expect(screen.queryByText("Bob")).not.toBeInTheDocument();
  });

  it("renders children (filter components)", () => {
    render(
      <DataGrid
        columns={columns}
        data={data}
        toolbar={(table) => (
          <DataGridToolbar table={table}>
            <button data-testid="custom-filter">Filter</button>
          </DataGridToolbar>
        )}
      />
    );
    expect(screen.getByTestId("custom-filter")).toBeInTheDocument();
  });
});
