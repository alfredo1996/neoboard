import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import type { ColumnDef } from "@tanstack/react-table";
import { DataGrid } from "../data-grid";
import { DataGridViewOptions } from "../data-grid-view-options";

interface TestRow {
  name: string;
  email: string;
}

const columns: ColumnDef<TestRow, unknown>[] = [
  { accessorKey: "name", header: "Name" },
  { accessorKey: "email", header: "Email" },
];

const data: TestRow[] = [{ name: "Alice", email: "alice@example.com" }];

describe("DataGridViewOptions", () => {
  it("renders view button via toolbar", () => {
    render(
      <DataGrid
        columns={columns}
        data={data}
        toolbar={(table) => (
          <div className="flex items-center py-4">
            <DataGridViewOptions table={table} />
          </div>
        )}
      />
    );
    expect(screen.getByRole("button", { name: /view/i })).toBeInTheDocument();
  });
});
