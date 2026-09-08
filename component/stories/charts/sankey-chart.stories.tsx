import type { Meta, StoryObj } from "@storybook/react";
import { expect, within } from "storybook/test";
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
  // The sankey is canvas-only, so the accessible name is the whole non-visual
  // rendering: it is what a screen reader gets instead of the flows. It also
  // pins the counts, so a link silently dropped from the story data shows up.
  // The absent alert is the real assertion — ECharts throws synchronously on
  // data it cannot lay out, and BaseChart turns that into the overlay below.
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await canvas.findByRole("img", {
      name: "Sankey diagram with 7 nodes and 7 links",
    });
    await expect(canvasElement.querySelector("canvas")).toBeInTheDocument();
    await expect(canvas.queryByRole("alert")).not.toBeInTheDocument();
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

/**
 * A cyclic flow — A → B → A — is ordinary in a graph query and fatal to a
 * sankey, which must be a DAG. ECharts throws inside setOption; BaseChart
 * catches it and renders the failure instead of taking the widget down
 * (#1656). This is the one chart state in the package where the *cause* of a
 * bad render is readable from the DOM, so it is worth asserting verbatim.
 */
export const CyclicLinks: Story = {
  args: {
    data: {
      nodes: [{ name: "A" }, { name: "B" }],
      links: [
        { source: "A", target: "B", value: 5 },
        { source: "B", target: "A", value: 2 },
      ],
    },
  },
  // The overlay is border-destructive/50 + bg-destructive/10 + text-destructive
  // — 4.25:1, under AA. That token pair is shared with every chart error state;
  // re-enable this once it is fixed rather than exempting more stories.
  parameters: { a11y: { test: "todo" } },
  play: async ({ canvasElement }) => {
    const alert = await within(canvasElement).findByRole("alert");
    await expect(alert).toHaveTextContent("Chart failed to render");
    await expect(alert).toHaveTextContent(/cycle/i);
    // setOption threw, so the half-drawn chart is cleared, not left on screen.
    await expect(canvasElement.querySelector("canvas")).not.toBeInTheDocument();
  },
};

/**
 * Two nodes with the same name — what a GROUP BY that is not actually unique
 * returns. ECharts logs "Graph nodes have duplicate name or id" and then throws
 * from its own layout code. The message is ECharts internals, so only the
 * stable half is asserted.
 *
 * The links are deliberately acyclic and reference only declared nodes, so the
 * duplicate is the *only* thing wrong here. With a cycle in the data too, this
 * story would keep failing for the cycle after the duplicate was fixed, and the
 * fix would look like it had not worked (#1667).
 */
export const DuplicateNodeNames: Story = {
  args: {
    data: {
      nodes: [{ name: "A" }, { name: "A" }, { name: "B" }],
      links: [{ source: "A", target: "B", value: 5 }],
    },
  },
  parameters: { a11y: { test: "todo" } },
  play: async ({ canvasElement }) => {
    const alert = await within(canvasElement).findByRole("alert");
    await expect(alert).toHaveTextContent("Chart failed to render");
  },
};

export const EmptyState: Story = {
  args: {
    data: { nodes: [], links: [] },
  },
  // No DOM empty state: "No data" is painted into the canvas, so the label is
  // all a screen reader gets. Asserting the canvas is still mounted documents
  // that — bar-chart is the only chart here that renders a real empty state.
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await canvas.findByRole("img", {
      name: "Sankey diagram with 0 nodes and 0 links",
    });
    await expect(canvasElement.querySelector("canvas")).toBeInTheDocument();
    await expect(canvas.queryByRole("alert")).not.toBeInTheDocument();
  },
};
