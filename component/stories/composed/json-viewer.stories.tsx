import type { Meta, StoryObj } from "@storybook/react";
import { JsonViewer } from "@/components/composed/json-viewer";

const meta = {
  title: "Composed/JsonViewer",
  component: JsonViewer,
  parameters: { layout: "centered" },
  tags: ["autodocs"],
  argTypes: {
    initialExpanded: {
      control: "number",
      description:
        "Number of levels to expand by default (or boolean for all/none)",
    },
  },
} satisfies Meta<typeof JsonViewer>;

export default meta;
type Story = StoryObj<typeof meta>;

const sampleData = {
  name: "John Doe",
  age: 30,
  active: true,
  email: "john@example.com",
  address: {
    street: "123 Main St",
    city: "Springfield",
    state: "IL",
    zip: "62701",
  },
  tags: ["admin", "user", "developer"],
};

export const Default: Story = {
  args: {
    data: sampleData,
    initialExpanded: 1,
  },
  decorators: [
    (Story) => (
      <div className="w-[500px]">
        <Story />
      </div>
    ),
  ],
};

export const FullyExpanded: Story = {
  args: {
    data: sampleData,
    initialExpanded: true,
  },
  decorators: [
    (Story) => (
      <div className="w-[500px]">
        <Story />
      </div>
    ),
  ],
};

export const FullyCollapsed: Story = {
  args: {
    data: sampleData,
    initialExpanded: 0,
  },
  decorators: [
    (Story) => (
      <div className="w-[500px]">
        <Story />
      </div>
    ),
  ],
};

export const NestedData: Story = {
  args: {
    data: {
      query: "MATCH (n) RETURN n LIMIT 25",
      result: {
        records: [
          {
            id: 1,
            labels: ["Person"],
            properties: { name: "Alice", born: 1984 },
          },
          {
            id: 2,
            labels: ["Movie"],
            properties: { title: "The Matrix", released: 1999 },
          },
        ],
        summary: {
          counters: { nodesCreated: 0, propertiesSet: 0 },
          resultAvailableAfter: 12,
          resultConsumedAfter: 15,
        },
      },
      metadata: {
        database: "neo4j",
        server: "localhost:7687",
        protocol: "bolt",
      },
    },
    initialExpanded: 2,
  },
  decorators: [
    (Story) => (
      <div className="w-[600px]">
        <Story />
      </div>
    ),
  ],
};

export const PrimitiveValues: Story = {
  args: {
    data: {
      string: "hello world",
      number: 42,
      float: 3.14,
      boolean: true,
      null_value: null,
      empty_array: [],
      empty_object: {},
    },
    initialExpanded: true,
  },
  decorators: [
    (Story) => (
      <div className="w-[500px]">
        <Story />
      </div>
    ),
  ],
};

export const ArrayData: Story = {
  args: {
    data: [
      { id: 1, name: "Item 1", status: "active" },
      { id: 2, name: "Item 2", status: "inactive" },
      { id: 3, name: "Item 3", status: "active" },
    ],
    initialExpanded: 1,
  },
  decorators: [
    (Story) => (
      <div className="w-[500px]">
        <Story />
      </div>
    ),
  ],
};

const orders = [
  {
    id: 578,
    status: "shipped",
    total: 1672.56,
    order_date: "2026-03-31 22:52",
    customer: "Priya Johnson",
  },
  {
    id: 516,
    status: "cancelled",
    total: 652.88,
    order_date: "2026-03-31 22:24",
    customer: "Irene Ito",
  },
  {
    id: 929,
    status: "pending",
    total: 1937.52,
    order_date: "2026-03-31 19:59",
    customer: "Diego Yamamoto",
  },
];

/** Each row folds to one line showing its first fields; a click opens it (#2232). */
export const FoldedRows: Story = {
  args: { data: orders, initialExpanded: 1 },
  decorators: [
    (Story) => (
      <div className="w-[560px]">
        <Story />
      </div>
    ),
  ],
};

export const FoldedRowsDark: Story = {
  ...FoldedRows,
  globals: { theme: "dark" },
};
