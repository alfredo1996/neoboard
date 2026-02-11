import type { Meta, StoryObj } from "@storybook/react";
import type { ColumnDef } from "@tanstack/react-table";
import { DataGrid } from "@/components/composed/data-grid";
import type { DataGridProps } from "@/components/composed/data-grid";

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

const columns: ColumnDef<Payment, unknown>[] = [
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
    columns,
    data,
  },
};

export const WithSorting: Story = {
  args: {
    columns,
    data,
    enableSorting: true,
  },
};

export const WithSelection: Story = {
  args: {
    columns,
    data,
    enableSelection: true,
  },
};

export const WithColumnVisibility: Story = {
  args: {
    columns,
    data,
    enableColumnVisibility: true,
  },
};

export const WithPagination: Story = {
  args: {
    columns,
    data: [
      ...data,
      ...data.map((d, i) => ({ ...d, id: `extra-${i}`, email: `extra${i}@example.com` })),
    ],
    pageSize: 5,
  },
};

export const FullFeatured: Story = {
  args: {
    columns,
    data: [
      ...data,
      ...data.map((d, i) => ({ ...d, id: `extra-${i}`, email: `extra${i}@example.com` })),
    ],
    enableSorting: true,
    enableSelection: true,
    enableColumnVisibility: true,
    pageSize: 5,
  },
};

export const EmptyState: Story = {
  args: {
    columns,
    data: [],
  },
};
