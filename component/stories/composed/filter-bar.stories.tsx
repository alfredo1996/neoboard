import * as React from "react";
import type { Meta, StoryObj } from "@storybook/react";
import { FilterBar } from "@/components/composed/filter-bar";
import type { FilterDef } from "@/components/composed/filter-bar";
import { fn } from "storybook/test";

const filters: FilterDef[] = [
  { key: "name", label: "Name", type: "text" },
  {
    key: "status",
    label: "Status",
    type: "select",
    options: [
      { value: "active", label: "Active" },
      { value: "inactive", label: "Inactive" },
      { value: "pending", label: "Pending" },
    ],
  },
  { key: "email", label: "Email", type: "text" },
  {
    key: "role",
    label: "Role",
    type: "select",
    options: [
      { value: "admin", label: "Admin" },
      { value: "user", label: "User" },
      { value: "viewer", label: "Viewer" },
    ],
  },
];

const meta = {
  title: "Composed/FilterBar",
  component: FilterBar,
  parameters: { layout: "padded" },
  tags: ["autodocs"],
  args: {
    onChange: fn(),
  },
} satisfies Meta<typeof FilterBar>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    filters,
    values: {},
  },
};

export const WithActiveFilters: Story = {
  args: {
    filters,
    values: { name: "Alice", status: "active" },
  },
};

export const Interactive: Story = {
  args: {
    filters,
    values: {},
  },
  render: function InteractiveFilterBar() {
    const [values, setValues] = React.useState<Record<string, string>>({
      status: "active",
    });
    return (
      <FilterBar
        filters={filters}
        values={values}
        onChange={setValues}
        onClear={() => setValues({})}
      />
    );
  },
};
