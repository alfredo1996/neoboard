import type { Meta, StoryObj } from "@storybook/react";
import { useState } from "react";
import { FilterLine } from "@/components/kit/filter-line";

function Live(args: React.ComponentProps<typeof FilterLine>) {
  const [filters, setFilters] = useState(args.filters);
  return (
    <FilterLine
      {...args}
      filters={filters}
      onRemove={(id) => setFilters((f) => f.filter((x) => x.id !== id))}
      onReset={() => setFilters([])}
    />
  );
}

const meta = {
  title: "Kit/FilterLine",
  component: FilterLine,
  parameters: { layout: "padded" },
  tags: ["autodocs"],
  argTypes: { prefix: { control: "text" } },
  args: {
    prefix: "Showing",
    filters: [
      { id: "decade", label: "Decade", value: "1990s" },
      { id: "actor", label: "Actor", value: "Tom Hanks" },
    ],
    onRemove: () => {},
    onReset: () => {},
  },
  render: (args) => <Live {...args} />,
} satisfies Meta<typeof FilterLine>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
export const OneFilter: Story = {
  args: {
    prefix: "Showing dashboards where",
    filters: [{ id: "owner", label: "Owner", value: "you" }],
  },
};
export const Dark: Story = { globals: { theme: "dark" } };
