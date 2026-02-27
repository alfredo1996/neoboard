import type { Meta, StoryObj } from "@storybook/react";
import type { ColumnDef } from "@tanstack/react-table";
import { Badge } from "@/components/ui/badge";
import { DataGrid } from "@/components/composed/data-grid";
import { DataGridColumnHeader } from "@/components/composed/data-grid-column-header";
import { DataGridPagination } from "@/components/composed/data-grid-pagination";
import { DataGridFacetedFilter } from "@/components/composed/data-grid-faceted-filter";
import type { DataGridProps } from "@/components/composed/data-grid";
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
  { id: "m5gr84i9", amount: 316, status: "success", email: "ken99@example.com" },
  { id: "3u1reuv4", amount: 242, status: "success", email: "abe45@example.com" },
  { id: "derv1ws0", amount: 837, status: "processing", email: "monserrat44@example.com" },
  { id: "5kma53ae", amount: 874, status: "success", email: "silas22@example.com" },
  { id: "bhqecj4p", amount: 721, status: "failed", email: "carmella@example.com" },
  { id: "p0qr9s2t", amount: 150, status: "pending", email: "derek@example.com" },
  { id: "a1b2c3d4", amount: 999, status: "success", email: "jane@example.com" },
  { id: "e5f6g7h8", amount: 432, status: "processing", email: "mark@example.com" },
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
const enhancedColumns: ColumnDef<Payment, unknown>[] = [
  { accessorKey: "id", header: "ID", enableHiding: false },
  {
    accessorKey: "status",
    header: ({ column }) => (
      <DataGridColumnHeader column={column} title="Status" />
    ),
    cell: ({ row }) => {
      const status = row.getValue("status") as string;
      const variant = status === "success" ? "default" : status === "failed" ? "destructive" : "secondary";
      return <Badge variant={variant}>{status}</Badge>;
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
    cell: ({ row }) => (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" className="h-8 w-8 p-0">
            <MoreHorizontal className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onClick={() => console.log("Edit", row.original)}>Edit</DropdownMenuItem>
          <DropdownMenuItem onClick={() => navigator.clipboard.writeText(row.original.id)}>Copy ID</DropdownMenuItem>
          <DropdownMenuItem className="text-destructive" onClick={() => console.log("Delete", row.original)}>Delete</DropdownMenuItem>
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
  ...data.map((d, i) => ({ ...d, id: `extra-${i}`, email: `extra${i}@example.com` })),
  ...data.map((d, i) => ({ ...d, id: `more-${i}`, email: `more${i}@example.com` })),
];

const meta = {
  title: "Composed/DataGrid",
  component: DataGrid,
  parameters: { layout: "padded" },
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
    enableColumnFilters: true,
    enableGlobalFilter: true,
    pageSize: 10,
    toolbar: (table) => (
      <div className="flex items-center gap-2 py-4">
        <Input
          placeholder="Filter emails..."
          value={(table.getColumn("email")?.getFilterValue() as string) ?? ""}
          onChange={(e) => table.getColumn("email")?.setFilterValue(e.target.value)}
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
    pagination: (table) => <DataGridPagination table={table} />,
  },
};

export const EmptyState: Story = {
  args: {
    columns: basicColumns,
    data: [],
  },
};
