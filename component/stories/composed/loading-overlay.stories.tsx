import type { Meta, StoryObj } from "@storybook/react";
import { LoadingOverlay } from "@/components/composed/loading-overlay";
import {
  Panel,
  PanelContent,
  PanelHeader,
  PanelTitle,
} from "@/components/ui/panel";

const meta = {
  title: "Composed/LoadingOverlay",
  component: LoadingOverlay,
  parameters: { layout: "centered" },
  tags: ["autodocs"],
  argTypes: {
    loading: {
      control: "boolean",
    },
    text: {
      control: "text",
    },
  },
  args: {
    loading: true,
  },
} satisfies Meta<typeof LoadingOverlay>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  render: (args) => (
    <LoadingOverlay {...args} className="w-[300px] h-[200px] border rounded-lg">
      <div className="p-4">
        <h3 className="font-semibold">Content Area</h3>
        <p className="text-sm text-muted-foreground">
          This content is behind the loading overlay.
        </p>
      </div>
    </LoadingOverlay>
  ),
};

export const WithText: Story = {
  args: {
    loading: true,
    text: "Loading data…",
  },
  render: (args) => (
    <LoadingOverlay {...args} className="w-[300px] h-[200px] border rounded-lg">
      <div className="p-4">
        <h3 className="font-semibold">Dashboard</h3>
        <p className="text-sm text-muted-foreground">
          Your data will appear here.
        </p>
      </div>
    </LoadingOverlay>
  ),
};

export const OnCard: Story = {
  args: {
    loading: true,
    text: "Fetching metrics…",
  },
  render: (args) => (
    <LoadingOverlay {...args}>
      <Panel className="w-[350px]">
        <PanelHeader>
          <PanelTitle>Revenue Overview</PanelTitle>
        </PanelHeader>
        <PanelContent>
          <div className="h-[200px] flex items-center justify-center">
            Chart placeholder
          </div>
        </PanelContent>
      </Panel>
    </LoadingOverlay>
  ),
};

export const NotLoading: Story = {
  args: {
    loading: false,
  },
  render: (args) => (
    <LoadingOverlay {...args}>
      <Panel className="w-[350px]">
        <PanelHeader>
          <PanelTitle>Loaded Content</PanelTitle>
        </PanelHeader>
        <PanelContent>
          <p className="text-sm text-muted-foreground">
            The overlay is hidden when loading is false.
          </p>
        </PanelContent>
      </Panel>
    </LoadingOverlay>
  ),
};
