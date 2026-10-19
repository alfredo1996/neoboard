import type { Meta, StoryObj } from "@storybook/react";
import {
  Panel,
  PanelHeader,
  PanelFooter,
  PanelTitle,
  PanelDescription,
  PanelContent,
} from "@/components/ui/panel";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const meta = {
  title: "UI/Panel",
  component: Panel,
  parameters: { layout: "centered" },
  tags: ["autodocs"],
  argTypes: {
    className: {
      control: "text",
      description: "Additional CSS classes to apply to the card",
    },
  },
  args: {
    className: "w-[350px]",
  },
} satisfies Meta<typeof Panel>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  render: (args) => (
    <Panel {...args}>
      <PanelHeader>
        <PanelTitle>Panel Title</PanelTitle>
        <PanelDescription>Panel Description</PanelDescription>
      </PanelHeader>
      <PanelContent>
        <p>Panel Content</p>
      </PanelContent>
      <PanelFooter>
        <p>Panel Footer</p>
      </PanelFooter>
    </Panel>
  ),
};

export const Simple: Story = {
  render: (args) => (
    <Panel {...args}>
      <PanelHeader>
        <PanelTitle>Simple Panel</PanelTitle>
      </PanelHeader>
      <PanelContent>
        <p>This is a simple card with just a title and content.</p>
      </PanelContent>
    </Panel>
  ),
};

export const WithForm: Story = {
  render: (args) => (
    <Panel {...args}>
      <PanelHeader>
        <PanelTitle>Create project</PanelTitle>
        <PanelDescription>
          Deploy your new project in one-click.
        </PanelDescription>
      </PanelHeader>
      <PanelContent>
        <form>
          <div className="grid w-full items-center gap-4">
            <div className="flex flex-col space-y-1.5">
              <Label htmlFor="name">Name</Label>
              <Input id="name" placeholder="Name of your project" />
            </div>
          </div>
        </form>
      </PanelContent>
      <PanelFooter className="flex justify-between">
        <Button variant="secondary">Cancel</Button>
        <Button>Deploy</Button>
      </PanelFooter>
    </Panel>
  ),
};
