import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import userEvent from "@testing-library/user-event";
import type { ColumnDef } from "@tanstack/react-table";
import { DataGrid } from "../data-grid";
import { DataGridViewOptions } from "../data-grid-view-options";

interface TestRow {
  name: string;
  email: string;
  total_spend: number;
}

const columns: ColumnDef<TestRow, unknown>[] = [
  { accessorKey: "name", header: "Name" },
  { accessorKey: "email", header: "Email" },
  { accessorKey: "total_spend", header: "Total Spend" },
];

const data: TestRow[] = [
  { name: "Alice", email: "alice@example.com", total_spend: 100 },
];

describe("DataGridViewOptions", () => {
  it("renders icon-only button with sr-only text and title", () => {
    render(
      <DataGrid
        columns={columns}
        data={data}
        toolbar={(table) => (
          <div className="flex items-center py-4">
            <DataGridViewOptions table={table} />
          </div>
        )}
      />,
    );
    // Button accessible via sr-only span
    const button = screen.getByRole("button", { name: /hide columns/i });
    expect(button).toBeInTheDocument();
    expect(button).toHaveAttribute("title", "Hide columns");
  });

  it("humanizes snake_case column labels in the hide-columns menu (#1055)", async () => {
    const user = userEvent.setup();
    render(
      <DataGrid
        columns={columns}
        data={data}
        toolbar={(table) => <DataGridViewOptions table={table} />}
      />,
    );
    await user.click(screen.getByRole("button", { name: /hide columns/i }));
    // total_spend → "Total Spend", not "total_spend".
    expect(
      screen.getByRole("menuitemcheckbox", { name: "Total Spend" }),
    ).toBeInTheDocument();
    expect(screen.queryByText("total_spend")).not.toBeInTheDocument();
  });

  it("does not render visible 'View' label text", () => {
    render(
      <DataGrid
        columns={columns}
        data={data}
        pagination={(table) => <DataGridViewOptions table={table} />}
      />,
    );
    // The word "View" should not appear as visible text (only sr-only is acceptable)
    const buttons = screen.queryAllByRole("button", { name: /^view$/i });
    expect(buttons).toHaveLength(0);
  });
});
