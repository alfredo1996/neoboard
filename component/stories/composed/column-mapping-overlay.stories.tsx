import type { Meta, StoryObj } from "@storybook/react";
import { useState } from "react";
import { ColumnMappingOverlay } from "@/components/composed/column-mapping-overlay";
import type { ColumnMapping } from "@/components/composed/column-mapping-overlay";

const meta = {
  title: "Composed/ColumnMappingOverlay",
  component: ColumnMappingOverlay,
  parameters: { layout: "centered" },
  tags: ["autodocs"],
  argTypes: {
    chartType: { control: "select", options: ["bar", "line", "pie"] },
  },
} satisfies Meta<typeof ColumnMappingOverlay>;

export default meta;
type Story = StoryObj<typeof meta>;

const COLUMNS = ["month", "revenue", "orders", "region"];

function ControlledDemo({
  chartType,
  initial,
}: {
  chartType: "bar" | "line" | "pie";
  initial: ColumnMapping;
}) {
  const [mapping, setMapping] = useState<ColumnMapping>(initial);
  return (
    <ColumnMappingOverlay
      chartType={chartType}
      availableColumns={COLUMNS}
      mapping={mapping}
      onMappingChange={setMapping}
    />
  );
}

export const Bar: Story = {
  args: {
    chartType: "bar",
    availableColumns: COLUMNS,
    mapping: {},
    onMappingChange: () => {},
  },
  render: () => (
    <ControlledDemo
      chartType="bar"
      initial={{ xAxis: "month", yAxis: ["revenue"] }}
    />
  ),
};

export const Line: Story = {
  args: Bar.args,
  render: () => (
    <ControlledDemo
      chartType="line"
      initial={{ xAxis: "month", yAxis: ["revenue", "orders"] }}
    />
  ),
};

export const PieUnmapped: Story = {
  args: Bar.args,
  render: () => <ControlledDemo chartType="pie" initial={{}} />,
};
