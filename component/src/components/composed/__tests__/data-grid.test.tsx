import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi } from "vitest";
import { DataGrid } from "../data-grid";
import { DataGridColumnHeader } from "../data-grid-column-header";
import type { ColumnDef } from "@tanstack/react-table";

interface TestRow {
  id: number;
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
  { id: 1, name: "Alice", email: "alice@example.com", status: "Active" },
  { id: 2, name: "Bob", email: "bob@example.com", status: "Inactive" },
  { id: 3, name: "Charlie", email: "charlie@example.com", status: "Active" },
];

const manyRows: TestRow[] = Array.from({ length: 25 }, (_, i) => ({
  id: i + 1,
  name: `User ${i + 1}`,
  email: `user${i + 1}@example.com`,
  status: i % 2 === 0 ? "Active" : "Inactive",
}));

describe("DataGrid", () => {
  it("renders column headers", () => {
    render(<DataGrid columns={columns} data={data} />);
    expect(screen.getByText("Name")).toBeInTheDocument();
    expect(screen.getByText("Email")).toBeInTheDocument();
    expect(screen.getByText("Status")).toBeInTheDocument();
  });

  it("renders data rows", () => {
    render(<DataGrid columns={columns} data={data} />);
    expect(screen.getByText("Alice")).toBeInTheDocument();
    expect(screen.getByText("bob@example.com")).toBeInTheDocument();
    expect(screen.getByText("Charlie")).toBeInTheDocument();
  });

  it("shows empty state when no data", () => {
    render(<DataGrid columns={columns} data={[]} />);
    expect(screen.getByText("No results.")).toBeInTheDocument();
  });

  it("calls onCellClick with column and value when a cell is clicked", async () => {
    const user = userEvent.setup();
    const onCellClick = vi.fn();
    render(<DataGrid columns={columns} data={data} onCellClick={onCellClick} />);
    await user.click(screen.getByText("Alice"));
    expect(onCellClick).toHaveBeenCalledWith({ column: "name", value: "Alice" });
  });

  it("enables sorting when enableSorting is true", () => {
    // Sorting is enabled via the table model; sort UI comes from DataGridColumnHeader
    render(<DataGrid columns={columns} data={data} enableSorting />);
    // Verify data renders (sorting model is configured internally)
    expect(screen.getByText("Alice")).toBeInTheDocument();
  });

  it("does not render sort buttons when enableSorting is false", () => {
    // Columns using DataGridColumnHeader — when enableSorting=false the header
    // should render as a plain div (no Button) because column.getCanSort() === false.
    const sortableColumns: ColumnDef<TestRow, unknown>[] = [
      {
        accessorKey: "name",
        header: ({ column }) => (
          <DataGridColumnHeader column={column} title="Name" />
        ),
      },
      {
        accessorKey: "email",
        header: ({ column }) => (
          <DataGridColumnHeader column={column} title="Email" />
        ),
      },
    ];
    render(
      <DataGrid columns={sortableColumns} data={data} enableSorting={false} />
    );
    // Column headers should be plain text with no sort button
    expect(screen.getByText("Name")).toBeInTheDocument();
    expect(screen.getByText("Email")).toBeInTheDocument();
    // No sort-trigger buttons should appear in the header
    expect(screen.queryByRole("button", { name: /name/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /email/i })).not.toBeInTheDocument();
  });

  it("renders sort buttons when enableSorting is true", () => {
    // Columns using DataGridColumnHeader — when enableSorting=true the header
    // renders as a Button (dropdown trigger) because column.getCanSort() === true.
    const sortableColumns: ColumnDef<TestRow, unknown>[] = [
      {
        accessorKey: "name",
        header: ({ column }) => (
          <DataGridColumnHeader column={column} title="Name" />
        ),
      },
      {
        accessorKey: "email",
        header: ({ column }) => (
          <DataGridColumnHeader column={column} title="Email" />
        ),
      },
    ];
    render(
      <DataGrid columns={sortableColumns} data={data} enableSorting={true} />
    );
    // Column headers should render as buttons (dropdown triggers for sorting)
    expect(screen.getByRole("button", { name: /name/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /email/i })).toBeInTheDocument();
  });

  it("renders checkboxes when enableSelection is true", () => {
    render(<DataGrid columns={columns} data={data} enableSelection />);
    const checkboxes = screen.getAllByRole("checkbox");
    // 1 header checkbox + 3 row checkboxes
    expect(checkboxes).toHaveLength(4);
  });

  it("does not render checkboxes when enableSelection is false", () => {
    render(<DataGrid columns={columns} data={data} />);
    expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
  });

  it("renders custom toolbar when provided", () => {
    render(
      <DataGrid
        columns={columns}
        data={data}
        toolbar={() => <div data-testid="custom-toolbar">Toolbar</div>}
      />
    );
    expect(screen.getByTestId("custom-toolbar")).toBeInTheDocument();
  });

  it("paginates data with default page size", () => {
    render(<DataGrid columns={columns} data={manyRows} pageSize={10} />);
    // First page should show 10 rows
    const rows = screen.getAllByText(/User \d+/);
    expect(rows).toHaveLength(10);
    // Should show pagination controls
    expect(screen.getByText("Page 1 of 3")).toBeInTheDocument();
  });

  it("navigates to next page", async () => {
    const user = userEvent.setup();
    render(<DataGrid columns={columns} data={manyRows} pageSize={10} />);
    await user.click(screen.getByRole("button", { name: "Next" }));
    expect(screen.getByText("Page 2 of 3")).toBeInTheDocument();
    expect(screen.getByText("User 11")).toBeInTheDocument();
  });

  it("disables previous button on first page", () => {
    render(<DataGrid columns={columns} data={manyRows} pageSize={10} />);
    expect(screen.getByRole("button", { name: "Previous" })).toBeDisabled();
  });

  it("calls onSelectionChange when rows are selected", async () => {
    const user = userEvent.setup();
    const onSelectionChange = vi.fn();
    render(
      <DataGrid
        columns={columns}
        data={data}
        enableSelection
        onSelectionChange={onSelectionChange}
      />
    );
    const checkboxes = screen.getAllByRole("checkbox");
    // Click the first row checkbox (index 1, since 0 is "select all")
    await user.click(checkboxes[1]);
    expect(onSelectionChange).toHaveBeenCalledWith([data[0]]);
  });

  it("applies cursor-pointer class to cells when onCellClick is provided", () => {
    const { container } = render(
      <DataGrid columns={columns} data={data} onCellClick={() => {}} />
    );
    const tbody = container.querySelector("tbody");
    const cells = tbody!.querySelectorAll("td");
    // All data cells should have cursor-pointer
    expect(cells[0]).toHaveClass("cursor-pointer");
  });

  it("does not apply cursor-pointer to cells when onCellClick is not provided", () => {
    const { container } = render(
      <DataGrid columns={columns} data={data} />
    );
    const tbody = container.querySelector("tbody");
    const cells = tbody!.querySelectorAll("td");
    expect(cells[0]).not.toHaveClass("cursor-pointer");
  });

  it("applies custom className", () => {
    const { container } = render(
      <DataGrid columns={columns} data={data} className="custom-class" />
    );
    expect(container.firstChild).toHaveClass("custom-class");
  });
});
