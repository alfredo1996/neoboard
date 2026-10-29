import type { Meta, StoryObj } from "@storybook/react";
import { expect } from "storybook/test";
import type { ColumnDef } from "@tanstack/react-table";
import { Status, type StatusTone } from "@/components/ui/status";
import {
  DataGrid,
  type DataGridColumn,
  type DataGridProps,
} from "@/components/composed/data-grid";
import { DataGridColumnHeader } from "@/components/composed/data-grid-column-header";
import { DataGridFacetedFilter } from "@/components/composed/data-grid-faceted-filter";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { MoreHorizontal } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

interface Payment {
  id: string;
  amount: number;
  status: "pending" | "processing" | "success" | "failed";
  email: string;
}

const data: Payment[] = [
  {
    id: "m5gr84i9",
    amount: 316,
    status: "success",
    email: "ken99@example.com",
  },
  {
    id: "3u1reuv4",
    amount: 242,
    status: "success",
    email: "abe45@example.com",
  },
  {
    id: "derv1ws0",
    amount: 837,
    status: "processing",
    email: "monserrat44@example.com",
  },
  {
    id: "5kma53ae",
    amount: 874,
    status: "success",
    email: "silas22@example.com",
  },
  {
    id: "bhqecj4p",
    amount: 721,
    status: "failed",
    email: "carmella@example.com",
  },
  {
    id: "p0qr9s2t",
    amount: 150,
    status: "pending",
    email: "derek@example.com",
  },
  { id: "a1b2c3d4", amount: 999, status: "success", email: "jane@example.com" },
  {
    id: "e5f6g7h8",
    amount: 432,
    status: "processing",
    email: "mark@example.com",
  },
];

const basicColumns: ColumnDef<Payment, unknown>[] = [
  { accessorKey: "id", header: "ID" },
  { accessorKey: "status", header: "Status" },
  { accessorKey: "email", header: "Email" },
  {
    accessorKey: "amount",
    header: "Amount",
    cell: ({ row }) => {
      const amount = parseFloat(row.getValue("amount"));
      const formatted = new Intl.NumberFormat("en-US", {
        style: "currency",
        currency: "USD",
      }).format(amount);
      return <div className="font-medium">{formatted}</div>;
    },
  },
];

// Columns using the composable DataGridColumnHeader for sort/hide dropdown
const STATUS_TONES: Record<string, StatusTone> = {
  success: "good",
  failed: "failed",
  processing: "pending",
};

const enhancedColumns: ColumnDef<Payment, unknown>[] = [
  { accessorKey: "id", header: "ID", enableHiding: false },
  {
    accessorKey: "status",
    header: ({ column }) => (
      <DataGridColumnHeader column={column} title="Status" />
    ),
    cell: ({ row }) => {
      const status = row.getValue("status") as string;
      const tone = STATUS_TONES[status] ?? "none";
      return <Status tone={tone}>{status}</Status>;
    },
    filterFn: (row, id, value: string[]) => value.includes(row.getValue(id)),
  },
  {
    accessorKey: "email",
    header: ({ column }) => (
      <DataGridColumnHeader column={column} title="Email" />
    ),
  },
  {
    accessorKey: "amount",
    header: ({ column }) => (
      <DataGridColumnHeader column={column} title="Amount" />
    ),
    cell: ({ row }) => {
      const amount = parseFloat(row.getValue("amount"));
      const formatted = new Intl.NumberFormat("en-US", {
        style: "currency",
        currency: "USD",
      }).format(amount);
      return <div className="text-right font-medium">{formatted}</div>;
    },
  },
  {
    id: "actions",
    header: () => <span className="sr-only">Actions</span>,
    cell: ({ row }) => (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" className="h-8 w-8 p-0">
            <MoreHorizontal className="h-4 w-4" />
            <span className="sr-only">Open menu</span>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onClick={() => console.log("Edit", row.original)}>
            Edit
          </DropdownMenuItem>
          <DropdownMenuItem
            onClick={() => navigator.clipboard.writeText(row.original.id)}
          >
            Copy ID
          </DropdownMenuItem>
          <DropdownMenuItem
            className="text-destructive"
            onClick={() => console.log("Delete", row.original)}
          >
            Delete
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    ),
  },
];

const statusOptions = [
  { label: "Pending", value: "pending" },
  { label: "Processing", value: "processing" },
  { label: "Success", value: "success" },
  { label: "Failed", value: "failed" },
];

const moreData: Payment[] = [
  ...data,
  ...data.map((d, i) => ({
    ...d,
    id: `extra-${i}`,
    email: `extra${i}@example.com`,
  })),
  ...data.map((d, i) => ({
    ...d,
    id: `more-${i}`,
    email: `more${i}@example.com`,
  })),
];

const meta = {
  title: "Composed/DataGrid",
  component: DataGrid,
  parameters: {
    layout: "padded",
    docs: {
      description: {
        component:
          "**Keyboard (#1128):** `Tab` walks sortable column headers, clickable cells (#980), pagination and toolbar controls in DOM order · `Enter`/`Space` activates (toggle sort, cell click action, expand group) · faceted filters/view options open Radix popovers with their standard arrow-key + `Escape` handling.",
      },
    },
  },
  tags: ["autodocs"],
} satisfies Meta<typeof DataGrid>;

export default meta;
type Story = StoryObj<DataGridProps<Payment>>;

export const Default: Story = {
  args: {
    columns: basicColumns,
    data,
  },
};

export const WithSorting: Story = {
  args: {
    columns: basicColumns,
    data,
    enableSorting: true,
  },
};

export const WithSelection: Story = {
  args: {
    columns: basicColumns,
    data,
    enableSelection: true,
  },
};

export const WithPagination: Story = {
  args: {
    columns: basicColumns,
    data: moreData,
    pageSize: 5,
  },
};

export const WithToolbarAndFilters: Story = {
  args: {
    columns: enhancedColumns,
    data: moreData,
    enableSorting: true,
    enableSelection: true,
    enableGlobalFilter: true,
    pageSize: 10,
    toolbar: (table) => (
      <div className="flex items-center gap-2 py-4">
        <Input
          placeholder="Filter emails..."
          aria-label="Filter emails"
          value={(table.getColumn("email")?.getFilterValue() as string) ?? ""}
          onChange={(e) =>
            table.getColumn("email")?.setFilterValue(e.target.value)
          }
          className="h-8 w-[250px]"
        />
        {table.getColumn("status") && (
          <DataGridFacetedFilter
            column={table.getColumn("status")}
            title="Status"
            options={statusOptions}
          />
        )}
      </div>
    ),
  },
};

const grossRows = Array.from({ length: 50 }, (_, i) => ({
  title: `Film ${i + 1}`,
  year: 1970 + (i % 40),
  gross: i === 0 ? 40868.59 : (i + 1) * 1234.5,
  user_id: 12000 + i,
}));

type Film = (typeof grossRows)[number];
const filmColumns: DataGridColumn<Film>[] = [
  { accessorKey: "title", header: "Title" },
  { accessorKey: "year", header: "Year" },
  { accessorKey: "gross", header: "Gross" },
  { accessorKey: "user_id", header: "User_ID" },
];

/** #2222: numbers right-aligned with a separator, a year bare, the pager in the footer. */
export const NumbersAndYears: Story = {
  render: () => (
    <DataGrid
      columns={filmColumns}
      data={grossRows}
      enableSorting
      pageSize={10}
    />
  ),
};

/** The search box, over every visible column. */
export const WithSearchBox: Story = {
  render: () => (
    <DataGrid
      columns={filmColumns}
      data={grossRows}
      enableSorting
      enableGlobalFilter
      pageSize={10}
    />
  ),
};

export const WithCellClick: Story = {
  args: {
    columns: basicColumns,
    data,
    onCellClick: (info) => {
      console.log("Cell clicked:", info);
      alert(
        `Clicked column "${info.column}" with value: ${JSON.stringify(info.value)}`,
      );
    },
  },
};

export const EmptyState: Story = {
  args: {
    columns: basicColumns,
    data: [],
  },
};

/**
 * The auto page size must leave room for the pager in real layout (#2257):
 * jsdom has no layout, so this play function measures a rendered box. Heights that
 * fit a whole number of rows exactly are the worst case, so those are used.
 */
const FIT_HEIGHTS = [214, 216.5, 286, 288.5, 358, 360.5, 430, 432.5];

/** The grouped variant adds the "Collapse all / Expand all" bar above the table. */
const groupedColumns: DataGridColumn<Film>[] = filmColumns.map((c) =>
  "accessorKey" in c && c.accessorKey === "year"
    ? { ...c, enableGrouping: true }
    : c,
);

export const AutoPageSizeFitsItsContainer: Story = {
  render: () => (
    <div className="space-y-4">
      {FIT_HEIGHTS.flatMap((h) =>
        [false, true].map((grouped) => (
          <div
            key={`${h}-${grouped}`}
            data-testid={`box-${h}-${grouped ? "grouped" : "plain"}`}
            style={{ height: h }}
            className="overflow-y-auto"
          >
            <DataGrid
              columns={grouped ? groupedColumns : filmColumns}
              data={grossRows}
              enableSorting
              enableGrouping={grouped}
              initialGrouping={grouped ? ["year"] : undefined}
              containerHeight={h}
            />
          </div>
        )),
      )}
    </div>
  ),
  play: async ({ canvasElement }) => {
    for (const h of FIT_HEIGHTS) {
      for (const kind of ["plain", "grouped"]) {
        const box = canvasElement.querySelector<HTMLElement>(
          `[data-testid="box-${h}-${kind}"]`,
        )!;
        expect(
          box.scrollHeight,
          `${kind} container ${h}px`,
        ).toBeLessThanOrEqual(box.clientHeight);
      }
    }
  },
};

/**
 * No saved page size is Auto (#2356): the page follows the card's height,
 * and a typed number wins over it. Rows are counted in the real DOM.
 */
export const AutoPageSizeFollowsCardHeight: Story = {
  render: () => (
    <div className="space-y-4">
      {[
        { id: "short", h: 288.5, pageSize: undefined },
        { id: "tall", h: 720, pageSize: undefined },
        { id: "typed", h: 720, pageSize: 5 },
      ].map(({ id, h, pageSize }) => (
        <div key={id} data-testid={`rows-${id}`} style={{ height: h }}>
          <DataGrid
            columns={filmColumns}
            data={grossRows}
            containerHeight={h}
            pageSize={pageSize}
          />
        </div>
      ))}
    </div>
  ),
  play: async ({ canvasElement }) => {
    const rows = (id: string) =>
      canvasElement.querySelectorAll(`[data-testid="rows-${id}"] tbody tr`)
        .length;
    expect(rows("tall")).toBeGreaterThan(10);
    expect(rows("tall")).toBeGreaterThan(rows("short"));
    expect(rows("typed")).toBe(5);
  },
};
