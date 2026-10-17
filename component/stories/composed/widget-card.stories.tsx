import type { Meta, StoryObj } from "@storybook/react";
import { WidgetCard } from "@/components/composed/widget-card";

const meta = {
  title: "Composed/WidgetCard",
  component: WidgetCard,
  parameters: { layout: "centered" },
  tags: ["autodocs"],
  argTypes: {
    title: { control: "text" },
    source: { control: "text" },
    mode: {
      control: "inline-radio",
      options: ["view", "edit"],
      description:
        "View fades the actions in; edit shows the handle and a dashed edge.",
    },
    titleFont: {
      control: "inline-radio",
      options: ["sans", "serif"],
      description: "The title face. The KPI number follows it.",
    },
    headerRule: {
      control: "boolean",
      description: "The hairline between header and body.",
    },
    elevation: {
      control: "boolean",
      description: "The card's light shadow. Edit mode never has one.",
    },
  },
  args: {
    mode: "view",
    titleFont: "sans",
    headerRule: true,
    elevation: true,
  },
} satisfies Meta<typeof WidgetCard>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    title: "Revenue Chart",
    source: "Monthly revenue breakdown",
    children: (
      <div className="flex items-center justify-center h-48 text-muted-foreground">
        Chart content goes here
      </div>
    ),
  },
};

const body = (
  <div className="flex h-32 items-center justify-center text-muted-foreground">
    Chart content goes here
  </div>
);

/** The approved BI card, with a control for every look option (#2247). */
export const Playground: Story = {
  args: {
    title: "Movies by decade",
    source: "Movies graph · 5 rows · 2 min ago",
    onFullscreen: () => {},
    onRefresh: () => {},
    actions: [{ label: "Edit", onClick: () => {} }],
    children: body,
  },
};

export const PlaygroundDark: Story = {
  ...Playground,
  globals: { theme: "dark" },
};

export const SerifTitle: Story = {
  args: { ...Playground.args, titleFont: "serif" },
};

export const NoHeaderRule: Story = {
  args: { ...Playground.args, headerRule: false },
};

export const Flat: Story = {
  args: { ...Playground.args, elevation: false },
};

export const EditDark: Story = {
  args: { ...Playground.args, mode: "edit" },
  globals: { theme: "dark" },
};

export const WithActions: Story = {
  args: {
    title: "Active Users",
    source: "Real-time user activity",
    actions: [
      { label: "Edit", onClick: () => {} },
      { label: "Duplicate", onClick: () => {} },
      { label: "Delete", onClick: () => {}, destructive: true },
    ],
    children: (
      <div className="flex items-center justify-center h-48 text-muted-foreground">
        Widget content
      </div>
    ),
  },
};

export const Draggable: Story = {
  args: {
    title: "Draggable Widget",
    mode: "edit",
    actions: [
      { label: "Configure", onClick: () => {} },
      { label: "Remove", onClick: () => {}, destructive: true },
    ],
    children: (
      <div className="flex items-center justify-center h-48 text-muted-foreground">
        Drag the handle to reorder
      </div>
    ),
  },
};

export const DashboardLayout: Story = {
  args: { title: "Dashboard", children: null },
  render: () => (
    <div className="grid gap-4 md:grid-cols-2 w-[700px]">
      <WidgetCard
        title="Revenue"
        source="Last 30 days"
        actions={[{ label: "Edit", onClick: () => {} }]}
      >
        <div className="flex items-center justify-center h-32 text-muted-foreground">
          $45,231
        </div>
      </WidgetCard>
      <WidgetCard
        title="Users"
        source="Active this week"
        actions={[{ label: "Edit", onClick: () => {} }]}
      >
        <div className="flex items-center justify-center h-32 text-muted-foreground">
          2,350
        </div>
      </WidgetCard>
      <WidgetCard title="Recent Orders" className="md:col-span-2">
        <div className="flex items-center justify-center h-32 text-muted-foreground">
          Table content
        </div>
      </WidgetCard>
    </div>
  ),
};
