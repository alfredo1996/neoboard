import type { Meta, StoryObj } from "@storybook/react";
import {
  Card,
  CardHeader,
  CardFooter,
  CardTitle,
  CardDescription,
  CardContent,
  CardKpi,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const meta = {
  title: "UI/Card",
  component: Card,
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
} satisfies Meta<typeof Card>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  render: (args) => (
    <Card {...args}>
      <CardHeader>
        <CardTitle>Card Title</CardTitle>
        <CardDescription>Card Description</CardDescription>
      </CardHeader>
      <CardContent>
        <p>Card Content</p>
      </CardContent>
      <CardFooter>
        <p>Card Footer</p>
      </CardFooter>
    </Card>
  ),
};

export const Simple: Story = {
  render: (args) => (
    <Card {...args}>
      <CardHeader>
        <CardTitle>Simple Card</CardTitle>
      </CardHeader>
      <CardContent>
        <p>This is a simple card with just a title and content.</p>
      </CardContent>
    </Card>
  ),
};

export const WithForm: Story = {
  render: (args) => (
    <Card {...args}>
      <CardHeader>
        <CardTitle>Create project</CardTitle>
        <CardDescription>Deploy your new project in one-click.</CardDescription>
      </CardHeader>
      <CardContent>
        <form>
          <div className="grid w-full items-center gap-4">
            <div className="flex flex-col space-y-1.5">
              <Label htmlFor="name">Name</Label>
              <Input id="name" placeholder="Name of your project" />
            </div>
          </div>
        </form>
      </CardContent>
      <CardFooter className="flex justify-between">
        <Button variant="outline">Cancel</Button>
        <Button>Deploy</Button>
      </CardFooter>
    </Card>
  ),
};

export const KpiRow: Story = {
  render: () => (
    <div className="grid w-[720px] grid-cols-3 gap-4">
      <Card density="compact">
        <CardKpi
          label="Revenue"
          value="$1.2M"
          trend={12.4}
          trendLabel="vs last month"
        />
      </Card>
      <Card density="compact">
        <CardKpi label="Active users" value="8,421" trend={-3.2} />
      </Card>
      <Card density="compact">
        <CardKpi label="Queries / day" value="142K" />
      </Card>
    </div>
  ),
};

export const Densities: Story = {
  render: () => (
    <div className="flex w-[900px] gap-4">
      {(["default", "compact", "tight"] as const).map((d) => (
        <Card key={d} density={d} className="flex-1">
          <CardHeader>
            <CardTitle>{d}</CardTitle>
            <CardDescription>density: {d}</CardDescription>
          </CardHeader>
          <CardContent>Padding scales with density.</CardContent>
        </Card>
      ))}
    </div>
  ),
};
