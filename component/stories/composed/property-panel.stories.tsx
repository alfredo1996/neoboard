import type { Meta, StoryObj } from "@storybook/react";
import { PropertyPanel } from "@/components/composed/property-panel";

const meta = {
  title: "Composed/PropertyPanel",
  component: PropertyPanel,
  parameters: { layout: "padded" },
  tags: ["autodocs"],
  decorators: [
    (Story) => (
      <div className="w-80 border bg-card p-2">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof PropertyPanel>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    items: [
      { key: "name", value: "Alice" },
      { key: "age", value: 30 },
      { key: "email", value: "alice@example.com" },
      { key: "department", value: "Engineering" },
    ],
  },
};

/** Every datatype the inspector shows (#2349): lists one item per line, long values read under their key. */
export const AllDatatypes: Story = {
  args: {
    items: [
      { key: "name", value: "Exxon Mobil Corporation" },
      { key: "employees", value: 62000 },
      { key: "founded year", value: 1999 },
      { key: "revenue", value: -1.5 },
      { key: "listed", value: true },
      { key: "delisted", value: false },
      { key: "parent", value: null },
      { key: "missing", value: undefined },
      { key: "founded", value: "1999-11-30" },
      { key: "updatedAt", value: "2024-06-20T10:30:00Z" },
      { key: "fiscalYear", value: "P1Y" },
      { key: "hq", value: { srid: 4326, x: -96.9, y: 32.9 } },
      {
        key: "address",
        value: { city: "Spring", geo: { lat: 30.1, lng: -95.4 } },
      },
      {
        key: "previousNames",
        value: [
          "Esso",
          "Humble Oil",
          "Standard Oil of New Jersey",
          "Exxon Corporation",
          "Mobil",
          "ExxonMobil",
          "XOM",
        ],
      },
      { key: "matrix", value: [["a", "b"], ["c"]] },
      { key: "tags", value: [] },
      { key: "notes", value: "" },
      { key: "bigCounter", value: "9007199254740993" },
      {
        key: "description",
        value:
          "A very long single value that has to wrap onto several lines without hiding its key or running past the right edge of the panel. ".repeat(
            8,
          ),
      },
    ],
  },
};
