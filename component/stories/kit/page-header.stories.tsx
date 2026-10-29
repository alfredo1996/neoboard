import type { Meta, StoryObj } from "@storybook/react";
import { expect } from "storybook/test";
import { PageHeader } from "@/components/kit/page-header";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

type Args = React.ComponentProps<typeof PageHeader> & {
  withBreadcrumb: boolean;
  withActions: boolean;
  withTabs: boolean;
};

const meta = {
  title: "Kit/PageHeader",
  component: PageHeader,
  parameters: { layout: "fullscreen" },
  tags: ["autodocs"],
  argTypes: {
    title: { control: "text" },
    meta: { control: "text" },
    withBreadcrumb: { control: "boolean" },
    withActions: { control: "boolean" },
    withTabs: { control: "boolean" },
  },
  args: {
    title: "Movie highlights",
    meta: "Updated 3 min ago by Alice Demo · 12 widgets · Shared with 4 people",
    withBreadcrumb: true,
    withActions: true,
    withTabs: true,
  },
  render: ({ withBreadcrumb, withActions, withTabs, ...args }: Args) => (
    <PageHeader
      {...args}
      breadcrumb={
        withBreadcrumb
          ? [{ label: "Dashboards", href: "#" }, { label: args.title }]
          : undefined
      }
      actions={
        withActions ? (
          <>
            <Button variant="secondary" size="sm">
              Share
            </Button>
            <Button size="sm">Edit</Button>
          </>
        ) : undefined
      }
      tabs={
        withTabs ? (
          <Tabs defaultValue="overview">
            <TabsList>
              <TabsTrigger value="overview">Overview</TabsTrigger>
              <TabsTrigger value="cast">Cast and crew</TabsTrigger>
            </TabsList>
            <TabsContent value="overview" className="sr-only">
              Overview
            </TabsContent>
            <TabsContent value="cast" className="sr-only">
              Cast and crew
            </TabsContent>
          </Tabs>
        ) : undefined
      }
    />
  ),
} satisfies Meta<Args>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
export const TitleOnly: Story = {
  args: {
    withBreadcrumb: false,
    withActions: false,
    withTabs: false,
    meta: "",
  },
};
export const Dark: Story = { globals: { theme: "dark" } };

// A long current-page label must truncate inside a narrow header, not push it wide.
export const LongCurrentLabelNarrow: Story = {
  args: {
    title: "Movie highlights",
    withActions: false,
    withTabs: false,
    meta: "",
  },
  render: (args) => (
    <div style={{ width: 320 }} data-testid="narrow">
      <PageHeader
        title={args.title}
        breadcrumb={[
          { label: "Dashboards", href: "#" },
          {
            label:
              "A very long dashboard name that cannot possibly fit in three hundred pixels",
          },
        ]}
      />
    </div>
  ),
  play: async ({ canvasElement }) => {
    const box = canvasElement.querySelector<HTMLElement>(
      "[data-testid=narrow]",
    )!;
    const list = box.querySelector<HTMLElement>("ol")!;
    await expect(list.scrollWidth).toBeLessThanOrEqual(box.clientWidth);
  },
};
