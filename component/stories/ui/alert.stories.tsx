import type { Meta, StoryObj } from "@storybook/react";
import { AlertCircle, Terminal } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

const meta = {
  title: "UI/Alert",
  component: Alert,
  parameters: { layout: "centered" },
  tags: ["autodocs"],
  argTypes: {
    variant: {
      control: "select",
      options: [
        "default",
        "secondary",
        "tonal",
        "destructive",
        "success",
        "warning",
        "outline",
      ],
      description: "The visual style variant of the alert",
    },
  },
  args: {
    variant: "default",
  },
} satisfies Meta<typeof Alert>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  render: (args) => (
    <Alert className="w-[400px]" {...args}>
      <Terminal className="h-4 w-4" />
      <AlertTitle>Heads up!</AlertTitle>
      <AlertDescription>
        You can add components to your app using the cli.
      </AlertDescription>
    </Alert>
  ),
};

export const Destructive: Story = {
  args: { variant: "destructive" },
  render: (args) => (
    <Alert className="w-[400px]" {...args}>
      <AlertCircle className="h-4 w-4" />
      <AlertTitle>Error</AlertTitle>
      <AlertDescription>
        Your session has expired. Please log in again.
      </AlertDescription>
    </Alert>
  ),
};

export const Secondary: Story = {
  args: { variant: "secondary" },
  render: (args) => (
    <Alert className="w-[400px]" {...args}>
      <Terminal className="h-4 w-4" />
      <AlertTitle>Note</AlertTitle>
      <AlertDescription>
        Secondary surface for low-emphasis notices.
      </AlertDescription>
    </Alert>
  ),
};

export const Tonal: Story = {
  args: { variant: "tonal" },
  render: (args) => (
    <Alert className="w-[400px]" {...args}>
      <Terminal className="h-4 w-4" />
      <AlertTitle>Tip</AlertTitle>
      <AlertDescription>
        Citrine tonal surface for helpful callouts.
      </AlertDescription>
    </Alert>
  ),
};

export const Success: Story = {
  args: { variant: "success" },
  render: (args) => (
    <Alert className="w-[400px]" {...args}>
      <Terminal className="h-4 w-4" />
      <AlertTitle>Saved</AlertTitle>
      <AlertDescription>
        Your dashboard was published successfully.
      </AlertDescription>
    </Alert>
  ),
};

export const Warning: Story = {
  args: { variant: "warning" },
  render: (args) => (
    <Alert className="w-[400px]" {...args}>
      <AlertCircle className="h-4 w-4" />
      <AlertTitle>Heads up</AlertTitle>
      <AlertDescription>
        This connection is shared with the whole workspace.
      </AlertDescription>
    </Alert>
  ),
};

export const Outline: Story = {
  args: { variant: "outline" },
  render: (args) => (
    <Alert className="w-[400px]" {...args}>
      <Terminal className="h-4 w-4" />
      <AlertTitle>Plain</AlertTitle>
      <AlertDescription>Transparent bordered surface.</AlertDescription>
    </Alert>
  ),
};
