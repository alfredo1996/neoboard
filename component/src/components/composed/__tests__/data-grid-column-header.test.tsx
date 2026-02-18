import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import type { ColumnDef } from "@tanstack/react-table";
import { DataGrid } from "../data-grid";
import { DataGridColumnHeader } from "../data-grid-column-header";

interface TestRow {
  name: string;
  email: string;
}

const data: TestRow[] = [
  { name: "Alice", email: "alice@example.com" },
  { name: "Bob", email: "bob@example.com" },
];

describe("DataGridColumnHeader", () => {
  it("renders title text for non-sortable column", () => {
    const columns: ColumnDef<TestRow, unknown>[] = [
      {
        accessorKey: "name",
        header: ({ column }) => (
          <DataGridColumnHeader column={column} title="Name" />
        ),
        enableSorting: false,
      },
      { accessorKey: "email", header: "Email" },
    ];
    render(<DataGrid columns={columns} data={data} />);
    expect(screen.getByText("Name")).toBeInTheDocument();
  });

  it("renders sort dropdown button for sortable column", () => {
    const columns: ColumnDef<TestRow, unknown>[] = [
      {
        accessorKey: "name",
        header: ({ column }) => (
          <DataGridColumnHeader column={column} title="Name" />
        ),
      },
      { accessorKey: "email", header: "Email" },
    ];
    render(<DataGrid columns={columns} data={data} enableSorting />);
    // The header renders as a button when sortable
    expect(screen.getByRole("button", { name: /name/i })).toBeInTheDocument();
  });
});
