import type { Meta, StoryObj } from "@storybook/react";
import { PropertyPanel } from "@/components/composed/property-panel";

const meta = {
  title: "Composed/PropertyPanel",
  component: PropertyPanel,
  parameters: { layout: "padded" },
  tags: ["autodocs"],
} satisfies Meta<typeof PropertyPanel>;

export default meta;
type Story = StoryObj<typeof meta>;

const sections = [
  {
    title: "Node Properties",
    items: [
      { key: "name", value: "Alice" },
      { key: "age", value: "30" },
      { key: "email", value: "alice@example.com" },
      { key: "department", value: "Engineering" },
    ],
  },
  {
    title: "Metadata",
    items: [
      { key: "created", value: "2024-01-15" },
      { key: "updated", value: "2024-06-20" },
      { key: "id", value: "node-abc-123" },
    ],
  },
  {
    title: "Labels",
    items: [
      { key: "primary", value: "Person" },
      { key: "secondary", value: "Employee" },
    ],
  },
];

export const Default: Story = {
  args: { sections },
};

export const Editable: Story = {
  args: {
    sections,
    editable: true,
  },
};

export const WithNonCollapsible: Story = {
  args: {
    sections: [
      {
        title: "Identity",
        items: [{ key: "id", value: "node-123" }],
        collapsible: false,
      },
      ...sections,
    ],
    editable: true,
  },
};

export const GraphNodeInspector: Story = {
  args: {
    sections: [
      {
        title: "Person",
        collapsible: false,
        items: [{ key: "label", value: "Person" }],
      },
      {
        title: "Properties",
        items: [
          { key: "name", value: "Neo" },
          { key: "born", value: "1964" },
          { key: "occupation", value: "The One" },
        ],
      },
      {
        title: "Relationships",
        items: [
          { key: "ACTED_IN", value: "The Matrix (3)" },
          { key: "KNOWS", value: "Trinity, Morpheus" },
        ],
      },
    ],
    editable: true,
  },
};

/** Every datatype the inspector shows (#2349): lists one item per line, long values wrap. */
export const AllDatatypes: Story = {
  args: {
    sections: [
      {
        title: "Metadata",
        collapsible: false,
        items: [
          {
            key: "id",
            value: "4:89d8f0b2-3c1e-4f5a-9b7d-2e6a1c0f8d34:1234567",
          },
          { key: "labels", value: ["Company", "Shareholder"] },
        ],
      },
      {
        title: "Properties",
        items: [
          { key: "name", value: "Exxon Mobil Corporation" },
          { key: "employees", value: 62000 },
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
            key: "embedding",
            value: Object.fromEntries(
              Array.from({ length: 2000 }, (_, i) => [String(i), i / 1000]),
            ),
          },
          {
            key: "description",
            value:
              "A very long single value that has to wrap onto several lines without hiding its key or running past the right edge of the panel. ".repeat(
                8,
              ),
          },
        ],
      },
    ],
  },
  decorators: [
    (Story) => (
      <div className="w-80 border bg-card p-2">
        <Story />
      </div>
    ),
  ],
};
