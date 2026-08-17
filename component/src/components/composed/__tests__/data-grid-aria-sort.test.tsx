import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, beforeAll, vi } from "vitest";
import { DataGrid } from "../data-grid";
import { DataGridColumnHeader } from "../data-grid-column-header";
import type { ColumnDef } from "@tanstack/react-table";

// Same CI-oversubscription flake as data-grid-grouping.test.tsx (#1240/#1459):
// the four packages' coverage suites run in parallel, starving the macrotasks
// each userEvent dispatch yields on, so a sort-and-assert test creeps past the
// default 5s testTimeout. It failed at 5113ms in CI while its sibling in the
// same file passed at 1437ms. Give the userEvent-driven cases headroom.
// ponytail: this tolerates the oversubscription; the root cause is the parallel
// fan-out in ci.yml.
const SLOW_UI_TIMEOUT_MS = 15000;

/**
 * #1285 — sortable headers exposed sort state only as an unlabelled icon.
 *
 * `aria-sort` belongs on the `<th>`, not on the header component, so consumers
 * that render their own header cells (app/src/components/table-renderer.tsx)
 * inherit it without changing.
 */

beforeAll(() => {
  Element.prototype.scrollIntoView = vi.fn();
});

interface TestRow {
  id: number;
  name: string;
  email: string;
}

const data: TestRow[] = [
  { id: 1, name: "Alice", email: "alice@example.com" },
  { id: 2, name: "Bob", email: "bob@example.com" },
];

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

/** Sort via the header's dropdown, the only path a user has. */
async function sort(
  user: ReturnType<typeof userEvent.setup>,
  dir: "Asc" | "Desc",
) {
  await user.click(screen.getByRole("button", { name: /name/i }));
  await user.click(await screen.findByRole("menuitem", { name: dir }));
}

describe("#1285 — aria-sort on sortable headers", () => {
  it("marks a sortable column 'none' before any sort is applied", () => {
    render(<DataGrid columns={sortableColumns} data={data} enableSorting />);
    expect(screen.getByRole("columnheader", { name: /name/i })).toHaveAttribute(
      "aria-sort",
      "none",
    );
  });

  it(
    "reflects ascending and descending sort state",
    async () => {
      const user = userEvent.setup();
      render(<DataGrid columns={sortableColumns} data={data} enableSorting />);

      await sort(user, "Asc");
      expect(
        screen.getByRole("columnheader", { name: /name/i }),
      ).toHaveAttribute("aria-sort", "ascending");

      await sort(user, "Desc");
      expect(
        screen.getByRole("columnheader", { name: /name/i }),
      ).toHaveAttribute("aria-sort", "descending");
    },
    SLOW_UI_TIMEOUT_MS,
  );

  it(
    "leaves the other columns 'none' when one column is sorted",
    async () => {
      const user = userEvent.setup();
      render(<DataGrid columns={sortableColumns} data={data} enableSorting />);

      await sort(user, "Asc");
      expect(
        screen.getByRole("columnheader", { name: /email/i }),
      ).toHaveAttribute("aria-sort", "none");
    },
    SLOW_UI_TIMEOUT_MS,
  );

  it("omits aria-sort entirely on a non-sortable column", () => {
    // Not "none": announcing a non-sortable column as sortable is the defect
    // this guards against.
    render(
      <DataGrid columns={sortableColumns} data={data} enableSorting={false} />,
    );
    expect(
      screen.getByRole("columnheader", { name: /name/i }),
    ).not.toHaveAttribute("aria-sort");
  });

  it("omits aria-sort on the filter row", () => {
    render(
      <DataGrid
        columns={sortableColumns}
        data={data}
        enableSorting
        enableColumnFilters
      />,
    );
    const filterRow = screen.getByTestId("data-grid-filter-row");
    for (const cell of within(filterRow).getAllByRole("columnheader")) {
      expect(cell).not.toHaveAttribute("aria-sort");
    }
  });
});

describe("#1285 — sort direction icons are decorative", () => {
  it("keeps the trigger's accessible name equal to the column title", () => {
    render(<DataGrid columns={sortableColumns} data={data} enableSorting />);
    // Exact match: a stray icon contributing text would break this.
    expect(screen.getByRole("button", { name: "Name" })).toBeInTheDocument();
  });

  it("hides the direction icon from assistive tech", () => {
    render(<DataGrid columns={sortableColumns} data={data} enableSorting />);
    const svg = screen
      .getByRole("button", { name: "Name" })
      .querySelector("svg");
    expect(svg).not.toBeNull();
    expect(svg).toHaveAttribute("aria-hidden", "true");
  });
});
