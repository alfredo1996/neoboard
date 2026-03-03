import { render, screen } from "@testing-library/react";
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

  it("wraps clickable cells in a badge span when onCellClick is provided", () => {
    const { container } = render(
      <DataGrid columns={columns} data={data} onCellClick={() => {}} />
    );
    const tbody = container.querySelector("tbody");
    const cells = Array.from(tbody?.querySelectorAll("td") ?? []);
    expect(cells.length).toBeGreaterThan(0);
    for (const cell of cells) {
      expect(cell).toHaveClass("cursor-pointer");
      // Badge span should wrap cell content
      const badge = cell.querySelector("span");
      expect(badge).toBeTruthy();
      expect(badge).toHaveClass("text-primary");
      expect(badge).toHaveClass("rounded-md");
    }
  });

  it("does not wrap cells in a badge span when onCellClick is not provided", () => {
    const { container } = render(
      <DataGrid columns={columns} data={data} />
    );
    const tbody = container.querySelector("tbody");
    const cells = Array.from(tbody?.querySelectorAll("td") ?? []);
    expect(cells.length).toBeGreaterThan(0);
    for (const cell of cells) {
      expect(cell).not.toHaveClass("cursor-pointer");
      // No badge span wrapper
      const badge = cell.querySelector("span.rounded-md");
      expect(badge).toBeNull();
    }
  });

  it("wraps only cells in clickableColumns with badge span", () => {
    const { container } = render(
      <DataGrid
        columns={columns}
        data={data}
        onCellClick={() => {}}
        clickableColumns={["name"]}
      />
    );
    const tbody = container.querySelector("tbody");
    const rows = Array.from(tbody?.querySelectorAll("tr") ?? []);
    for (const row of rows) {
      const cells = Array.from(row.querySelectorAll("td"));
      if (cells.length === 0) continue;
      // First cell (name) should have badge span
      expect(cells[0]).toHaveClass("cursor-pointer");
      const badge0 = cells[0].querySelector("span.rounded-md");
      expect(badge0).toBeTruthy();
      expect(badge0).toHaveClass("text-primary");
      // Other cells should NOT have badge span
      expect(cells[1]).not.toHaveClass("cursor-pointer");
      expect(cells[1].querySelector("span.rounded-md")).toBeNull();
      expect(cells[2]).not.toHaveClass("cursor-pointer");
      expect(cells[2].querySelector("span.rounded-md")).toBeNull();
    }
  });

  it("does not fire onCellClick for cells outside clickableColumns", async () => {
    const user = userEvent.setup();
    const onCellClick = vi.fn();
    render(
      <DataGrid
        columns={columns}
        data={data}
        onCellClick={onCellClick}
        clickableColumns={["name"]}
      />
    );
    // Click email cell — should NOT trigger handler
    await user.click(screen.getByText("alice@example.com"));
    expect(onCellClick).not.toHaveBeenCalled();
    // Click name cell — should trigger handler
    await user.click(screen.getByText("Alice"));
    expect(onCellClick).toHaveBeenCalledWith({ column: "name", value: "Alice" });
  });

  it("wraps all cells with badge span when clickableColumns is empty", () => {
    const { container } = render(
      <DataGrid
        columns={columns}
        data={data}
        onCellClick={() => {}}
        clickableColumns={[]}
      />
    );
    const tbody = container.querySelector("tbody");
    const cells = Array.from(tbody?.querySelectorAll("td") ?? []);
    expect(cells.length).toBeGreaterThan(0);
    for (const cell of cells) {
      expect(cell).toHaveClass("cursor-pointer");
      const badge = cell.querySelector("span.rounded-md");
      expect(badge).toBeTruthy();
      expect(badge).toHaveClass("text-primary");
    }
  });

  it("wraps all cells with badge span when clickableColumns is undefined", () => {
    const { container } = render(
      <DataGrid
        columns={columns}
        data={data}
        onCellClick={() => {}}
      />
    );
    const tbody = container.querySelector("tbody");
    const cells = Array.from(tbody?.querySelectorAll("td") ?? []);
    expect(cells.length).toBeGreaterThan(0);
    for (const cell of cells) {
      expect(cell).toHaveClass("cursor-pointer");
      const badge = cell.querySelector("span.rounded-md");
      expect(badge).toBeTruthy();
    }
  });

  it("applies custom className", () => {
    const { container } = render(
      <DataGrid columns={columns} data={data} className="custom-class" />
    );
    expect(container.firstChild).toHaveClass("custom-class");
  });
});
