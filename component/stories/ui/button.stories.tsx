import type { Meta, StoryObj } from "@storybook/react";
import { ArrowUpIcon, MailIcon, Trash2Icon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { LoadingButton } from "@/components/composed/loading-button";

const variants = [
  "primary",
  "secondary",
  "ghost",
  "link",
  "danger",
  "danger-confirm",
] as const;

const meta = {
  title: "UI/Button",
  component: Button,
  parameters: { layout: "centered" },
  tags: ["autodocs"],
  argTypes: {
    variant: {
      control: "select",
      options: variants,
      description: "The visual style variant of the button",
    },
    size: {
      control: "select",
      options: ["default", "sm", "lg"],
      description: "The size of the button (icon sizes: see IconButtons)",
    },
    disabled: {
      control: "boolean",
      description: "Whether the button is disabled",
    },
    asChild: {
      control: "boolean",
      description: "Render as a child element using Radix Slot",
    },
    children: {
      control: "text",
      description: "Button content",
    },
  },
  args: {
    variant: "primary",
    size: "default",
    disabled: false,
    children: "Button",
  },
} satisfies Meta<typeof Button>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

/** Every variant at the default size, enabled then disabled. */
export const AllVariants: Story = {
  render: () => (
    <div className="flex flex-col gap-3">
      {[false, true].map((disabled) => (
        <div
          key={String(disabled)}
          className="flex flex-wrap items-center gap-2"
        >
          {variants.map((v) => (
            <Button key={v} variant={v} disabled={disabled}>
              {v}
            </Button>
          ))}
        </div>
      ))}
    </div>
  ),
};

/** Every variant at each text size: 32, 36 (default) and 40. */
export const Sizes: Story = {
  render: () => (
    <div className="flex flex-col gap-3">
      {(["sm", "default", "lg"] as const).map((size) => (
        <div key={size} className="flex flex-wrap items-center gap-2">
          {variants.map((v) => (
            <Button key={v} variant={v} size={size}>
              {v}
            </Button>
          ))}
        </div>
      ))}
    </div>
  ),
};

/** Icon-only: 36 and 32 square. An accessible name is required by the type. */
export const IconButtons: Story = {
  render: () => (
    <div className="flex flex-col gap-3">
      {(["icon", "icon-sm"] as const).map((size) => (
        <div key={size} className="flex flex-wrap items-center gap-2">
          {variants
            .filter((v) => v !== "link")
            .map((v) => (
              <Button key={v} variant={v} size={size} aria-label={`${v} icon`}>
                <ArrowUpIcon />
              </Button>
            ))}
        </div>
      ))}
    </div>
  ),
};

export const WithIcon: Story = {
  render: () => (
    <div className="flex flex-wrap items-center gap-2">
      <Button>
        <MailIcon />
        Login with email
      </Button>
      <Button variant="secondary">
        <MailIcon />
        Login with email
      </Button>
      <Button variant="danger">
        <Trash2Icon />
        Delete
      </Button>
    </div>
  ),
};

/** Keeps its width while busy; the label says what it is doing. */
export const Loading: Story = {
  render: () => (
    <div className="flex flex-wrap items-center gap-2">
      <LoadingButton>Save</LoadingButton>
      <LoadingButton loading loadingText="Saving...">
        Save
      </LoadingButton>
    </div>
  ),
};

export const Disabled: Story = {
  args: {
    children: "Disabled",
    disabled: true,
  },
};
