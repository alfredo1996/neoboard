import type { Meta, StoryObj } from "@storybook/react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { FieldError } from "@/components/ui/field-error";

const meta = {
  title: "UI/Input",
  component: Input,
  parameters: { layout: "centered" },
  tags: ["autodocs"],
  argTypes: {
    type: {
      control: "select",
      options: [
        "text",
        "email",
        "password",
        "number",
        "tel",
        "url",
        "search",
        "file",
      ],
      description: "The HTML input type",
    },
    placeholder: {
      control: "text",
      description: "Placeholder text",
    },
    disabled: {
      control: "boolean",
      description: "Whether the input is disabled",
    },
  },
  args: {
    type: "text",
    placeholder: "Enter text...",
    disabled: false,
  },
} satisfies Meta<typeof Input>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const Email: Story = {
  args: { type: "email", placeholder: "Email" },
};

export const Password: Story = {
  args: { type: "password", placeholder: "Password" },
};

export const Number: Story = {
  args: { type: "number", placeholder: "0" },
};

export const File: Story = {
  args: { type: "file", placeholder: undefined },
};

export const Disabled: Story = {
  args: { placeholder: "Disabled input", disabled: true },
};

export const WithLabel: Story = {
  render: () => (
    <div className="grid w-full max-w-sm items-center gap-1.5">
      <Label htmlFor="email-input">Email</Label>
      <Input type="email" id="email-input" placeholder="Email" />
    </div>
  ),
};

// Epic C (#1127): shared size scale + aria-invalid error treatment.
export const Sizes: Story = {
  render: () => (
    <div className="flex w-full max-w-md items-center gap-2">
      <Input size="sm" placeholder="sm" />
      <Input placeholder="default" />
      <Input size="lg" placeholder="lg" />
    </div>
  ),
};

export const Invalid: Story = {
  render: () => (
    <div className="grid w-full max-w-sm gap-1.5">
      <Label htmlFor="invalid-input">Email</Label>
      <Input
        id="invalid-input"
        aria-invalid
        aria-describedby="invalid-input-error"
        defaultValue="not-an-email"
      />
      <FieldError id="invalid-input-error">
        Enter a valid email address.
      </FieldError>
    </div>
  ),
};
