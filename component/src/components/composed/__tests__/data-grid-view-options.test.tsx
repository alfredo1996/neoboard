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
  it("renders icon-only button with sr-only text and title", () => {
    render(
      <DataGrid
        columns={columns}
        data={data}
        pagination={(table) => <DataGridViewOptions table={table} />}
      />
    );
    // Button accessible via sr-only span
    const button = screen.getByRole("button", { name: /toggle columns/i });
    expect(button).toBeInTheDocument();
    expect(button).toHaveAttribute("title", "Toggle columns");
  });

  it("does not render visible 'View' label text", () => {
    render(
      <DataGrid
        columns={columns}
        data={data}
        pagination={(table) => <DataGridViewOptions table={table} />}
      />
    );
    // The word "View" should not appear as visible text (only sr-only is acceptable)
    const buttons = screen.queryAllByRole("button", { name: /^view$/i });
    expect(buttons).toHaveLength(0);
  });
});
