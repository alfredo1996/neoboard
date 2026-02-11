import type { Meta, StoryObj } from "@storybook/react";
import { User, Lock, Bell, Settings } from "lucide-react";
import { VerticalTabs } from "@/components/composed/vertical-tabs";

const meta = {
  title: "Composed/VerticalTabs",
  component: VerticalTabs,
  parameters: { layout: "padded" },
  tags: ["autodocs"],
} satisfies Meta<typeof VerticalTabs>;

export default meta;
type Story = StoryObj<typeof meta>;

const items = [
  {
    value: "account",
    label: "Account",
    content: (
      <div className="space-y-2">
        <h3 className="text-lg font-medium">Account Settings</h3>
        <p className="text-sm text-muted-foreground">Manage your account details and preferences.</p>
      </div>
    ),
  },
  {
    value: "password",
    label: "Password",
    content: (
      <div className="space-y-2">
        <h3 className="text-lg font-medium">Password</h3>
        <p className="text-sm text-muted-foreground">Change your password and security settings.</p>
      </div>
    ),
  },
  {
    value: "notifications",
    label: "Notifications",
    content: (
      <div className="space-y-2">
        <h3 className="text-lg font-medium">Notifications</h3>
        <p className="text-sm text-muted-foreground">Configure how you receive notifications.</p>
      </div>
    ),
  },
];

export const Default: Story = {
  args: { items },
};

export const WithIcons: Story = {
  args: {
    items: [
      { ...items[0], icon: <User className="h-4 w-4" /> },
      { ...items[1], icon: <Lock className="h-4 w-4" /> },
      { ...items[2], icon: <Bell className="h-4 w-4" /> },
      {
        value: "settings",
        label: "Settings",
        icon: <Settings className="h-4 w-4" />,
        content: (
          <div className="space-y-2">
            <h3 className="text-lg font-medium">General Settings</h3>
            <p className="text-sm text-muted-foreground">Configure general application settings.</p>
          </div>
        ),
      },
    ],
  },
};

export const WithDisabled: Story = {
  args: {
    items: [
      items[0],
      items[1],
      { ...items[2], disabled: true },
    ],
  },
};

export const Horizontal: Story = {
  args: {
    items,
    orientation: "horizontal",
  },
};
