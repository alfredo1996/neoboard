import type { Meta, StoryObj } from "@storybook/react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Panel,
  PanelContent,
  PanelDescription,
  PanelFooter,
  PanelHeader,
  PanelTitle,
} from "@/components/ui/panel";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const meta = {
  title: "UI/Tabs",
  component: Tabs,
  parameters: { layout: "centered" },
  tags: ["autodocs"],
  argTypes: {
    defaultValue: {
      control: "text",
      description: "The default active tab value",
    },
    orientation: {
      control: "radio",
      options: ["horizontal", "vertical"],
      description: "The orientation of the tabs",
    },
  },
  args: {
    defaultValue: "account",
  },
} satisfies Meta<typeof Tabs>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  render: (args) => (
    <Tabs {...args} className="w-[400px]">
      <TabsList>
        <TabsTrigger value="account">Account</TabsTrigger>
        <TabsTrigger value="password">Password</TabsTrigger>
      </TabsList>
      <TabsContent value="account">
        Make changes to your account here.
      </TabsContent>
      <TabsContent value="password">Change your password here.</TabsContent>
    </Tabs>
  ),
};

const fourteen = Array.from({ length: 14 }, (_, i) => ({
  value: `p${i + 1}`,
  label: `${i + 1}. ${["Bar", "Line", "Pie", "Graph", "Map", "Table", "Gauge"][i % 7]}`,
}));

/** 14 tabs in a 600px frame: the row scrolls, fades, and shows edge buttons. */
export const Overflow: Story = {
  render: () => (
    <Tabs defaultValue="p12" className="w-[600px] border border-border">
      <TabsList aria-label="Pages">
        {fourteen.map((t) => (
          <TabsTrigger key={t.value} value={t.value}>
            {t.label}
          </TabsTrigger>
        ))}
      </TabsList>
      {fourteen.map((t) => (
        <TabsContent key={t.value} value={t.value} className="p-4">
          {t.label}
        </TabsContent>
      ))}
    </Tabs>
  ),
};

export const WithCards: Story = {
  render: () => (
    <Tabs defaultValue="account" className="w-[400px]">
      <TabsList>
        <TabsTrigger value="account">Account</TabsTrigger>
        <TabsTrigger value="password">Password</TabsTrigger>
      </TabsList>
      <TabsContent value="account">
        <Panel>
          <PanelHeader>
            <PanelTitle>Account</PanelTitle>
            <PanelDescription>
              Make changes to your account here. Click save when you're done.
            </PanelDescription>
          </PanelHeader>
          <PanelContent className="space-y-2">
            <div className="space-y-1">
              <Label htmlFor="name">Name</Label>
              <Input id="name" defaultValue="Pedro Duarte" />
            </div>
            <div className="space-y-1">
              <Label htmlFor="username">Username</Label>
              <Input id="username" defaultValue="@peduarte" />
            </div>
          </PanelContent>
          <PanelFooter>
            <Button>Save changes</Button>
          </PanelFooter>
        </Panel>
      </TabsContent>
      <TabsContent value="password">
        <Panel>
          <PanelHeader>
            <PanelTitle>Password</PanelTitle>
            <PanelDescription>
              Change your password here. After saving, you'll be logged out.
            </PanelDescription>
          </PanelHeader>
          <PanelContent className="space-y-2">
            <div className="space-y-1">
              <Label htmlFor="current">Current password</Label>
              <Input id="current" type="password" />
            </div>
            <div className="space-y-1">
              <Label htmlFor="new">New password</Label>
              <Input id="new" type="password" />
            </div>
          </PanelContent>
          <PanelFooter>
            <Button>Save password</Button>
          </PanelFooter>
        </Panel>
      </TabsContent>
    </Tabs>
  ),
};
