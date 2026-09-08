import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect } from "vitest";
import { DataGrid } from "../data-grid";
import type { ColumnDef } from "@tanstack/react-table";

/**
 * #1657 — a column's filter must not be inferred from row zero.
 *
 * DataGrid offers exactly one filter control per column: a free-text <Input>
 * (data-grid.tsx:452-467). TanStack's `filterFn: "auto"` picks the filter by
 * reading `flatRows[0]` (table-core ColumnFiltering.ts:274-296), and only one
 * of the five filters it can pick can honour typed text.
 */

interface TestRow {
  label: string;
  amount: number;
  note: string | null;
  canWrite: boolean;
}

const row = (r: Partial<TestRow> & { label: string }): TestRow => ({
  amount: 0,
  note: null,
  canWrite: false,
  ...r,
});

describe("#1657 — column filters do not depend on row zero", () => {
  it("matches the text typed into a numeric column instead of parsing a range", async () => {
    const user = userEvent.setup();
    render(
      <DataGrid
        columns={
          [
            { accessorKey: "label", header: "Label" },
            { accessorKey: "amount", header: "Amount" },
          ] as ColumnDef<TestRow, unknown>[]
        }
        data={[
          row({ label: "big", amount: 300 }),
          row({ label: "two", amount: 2 }),
          row({ label: "three", amount: 3 }),
        ]}
        enableColumnFilters
      />,
    );

    await user.type(screen.getByLabelText("Filter Amount"), "300");

    expect(screen.getByText("big")).toBeInTheDocument();
    expect(screen.queryByText("two")).not.toBeInTheDocument();
    expect(screen.queryByText("three")).not.toBeInTheDocument();
  });

  it("filters case-insensitively when row zero's cell is null", async () => {
    const user = userEvent.setup();
    render(
      <DataGrid
        columns={
          [
            { accessorKey: "label", header: "Label" },
            { accessorKey: "note", header: "Note" },
          ] as ColumnDef<TestRow, unknown>[]
        }
        data={[
          row({ label: "first", note: null }),
          row({ label: "second", note: "hello" }),
          row({ label: "third", note: "world" }),
        ]}
        enableColumnFilters
      />,
    );

    // Uppercase on purpose: it pins case-insensitivity as well as the null.
    await user.type(screen.getByLabelText("Filter Note"), "HEL");

    expect(screen.getByText("second")).toBeInTheDocument();
    expect(screen.queryByText("first")).not.toBeInTheDocument();
    expect(screen.queryByText("third")).not.toBeInTheDocument();
  });

  it("filters a boolean column by its rendered text", async () => {
    const user = userEvent.setup();
    render(
      <DataGrid
        columns={
          [
            { accessorKey: "label", header: "Label" },
            { accessorKey: "canWrite", header: "Write" },
          ] as ColumnDef<TestRow, unknown>[]
        }
        data={[
          row({ label: "ann", canWrite: true }),
          row({ label: "bob", canWrite: false }),
          row({ label: "cy", canWrite: true }),
        ]}
        enableColumnFilters
      />,
    );

    await user.type(screen.getByLabelText("Filter Write"), "true");

    expect(screen.getByText("ann")).toBeInTheDocument();
    expect(screen.getByText("cy")).toBeInTheDocument();
    expect(screen.queryByText("bob")).not.toBeInTheDocument();
  });
});
