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
      { title: "Identity", items: [{ key: "id", value: "node-123" }], collapsible: false },
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
