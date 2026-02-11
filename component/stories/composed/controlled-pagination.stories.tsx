import * as React from "react";
import type { Meta, StoryObj } from "@storybook/react";
import { ControlledPagination } from "@/components/composed/controlled-pagination";
import { fn } from "storybook/test";

const meta = {
  title: "Composed/ControlledPagination",
  component: ControlledPagination,
  parameters: { layout: "padded" },
  tags: ["autodocs"],
  args: {
    onPageChange: fn(),
  },
} satisfies Meta<typeof ControlledPagination>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    page: 1,
    totalPages: 10,
  },
};

export const MiddlePage: Story = {
  args: {
    page: 5,
    totalPages: 10,
  },
};

export const LastPage: Story = {
  args: {
    page: 10,
    totalPages: 10,
  },
};

export const WithPageSize: Story = {
  args: {
    page: 1,
    totalPages: 10,
    pageSize: 20,
    showPageSize: true,
    onPageSizeChange: fn(),
  },
};

export const Interactive: Story = {
  args: {
    page: 1,
    totalPages: 10,
  },
  render: function InteractivePagination() {
    const [page, setPage] = React.useState(1);
    const [pageSize, setPageSize] = React.useState(10);
    const totalItems = 95;
    const totalPages = Math.ceil(totalItems / pageSize);

    return (
      <div className="space-y-4">
        <p className="text-sm text-muted-foreground">
          Showing items {(page - 1) * pageSize + 1}–{Math.min(page * pageSize, totalItems)} of {totalItems}
        </p>
        <ControlledPagination
          page={page}
          totalPages={totalPages}
          onPageChange={setPage}
          pageSize={pageSize}
          onPageSizeChange={(size) => {
            setPageSize(size);
            setPage(1);
          }}
          showPageSize
        />
      </div>
    );
  },
};
