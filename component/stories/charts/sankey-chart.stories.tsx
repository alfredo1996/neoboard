import type { Meta, StoryObj } from "@storybook/react";
import { SankeyChart } from "@/charts/sankey-chart";

const meta = {
  title: "Charts/SankeyChart",
  component: SankeyChart,
  parameters: { layout: "padded" },
  tags: ["autodocs"],
  decorators: [
    (Story) => (
      <div style={{ width: "100%", height: 400 }}>
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof SankeyChart>;

export default meta;
type Story = StoryObj<typeof meta>;

const defaultData = {
  nodes: [
    { name: "Visitors" },
    { name: "Home Page" },
    { name: "Product Page" },
    { name: "Cart" },
    { name: "Checkout" },
    { name: "Purchase" },
    { name: "Bounce" },
  ],
  links: [
    { source: "Visitors", target: "Home Page", value: 1000 },
    { source: "Visitors", target: "Bounce", value: 300 },
    { source: "Home Page", target: "Product Page", value: 600 },
    { source: "Home Page", target: "Bounce", value: 200 },
    { source: "Product Page", target: "Cart", value: 350 },
    { source: "Cart", target: "Checkout", value: 280 },
    { source: "Checkout", target: "Purchase", value: 250 },
  ],
};

const multiLevelData = {
  nodes: [
    { name: "Revenue" },
    { name: "Products" },
    { name: "Services" },
    { name: "Software" },
    { name: "Hardware" },
    { name: "Consulting" },
    { name: "Support" },
    { name: "Enterprise" },
    { name: "SMB" },
    { name: "Consumer" },
    { name: "APAC" },
    { name: "EMEA" },
    { name: "Americas" },
  ],
  links: [
    { source: "Revenue", target: "Products", value: 6000 },
    { source: "Revenue", target: "Services", value: 4000 },
    { source: "Products", target: "Software", value: 3500 },
    { source: "Products", target: "Hardware", value: 2500 },
    { source: "Services", target: "Consulting", value: 2200 },
    { source: "Services", target: "Support", value: 1800 },
    { source: "Software", target: "Enterprise", value: 2000 },
    { source: "Software", target: "SMB", value: 1500 },
    { source: "Hardware", target: "Consumer", value: 2500 },
    { source: "Enterprise", target: "APAC", value: 800 },
    { source: "Enterprise", target: "EMEA", value: 700 },
    { source: "Enterprise", target: "Americas", value: 500 },
    { source: "SMB", target: "Americas", value: 1500 },
  ],
};

export const Default: Story = {
  args: {
    data: defaultData,
  },
};

export const MultiLevel: Story = {
  args: {
    data: multiLevelData,
  },
};

export const Vertical: Story = {
  args: {
    data: defaultData,
    orient: "vertical",
  },
};

export const EmptyState: Story = {
  args: {
    data: { nodes: [], links: [] },
  },
};
