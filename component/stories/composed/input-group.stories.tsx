import type { Meta, StoryObj } from "@storybook/react";
import { Search, Mail, DollarSign, AtSign } from "lucide-react";
import { InputGroup } from "@/components/composed/input-group";

const meta = {
  title: "Composed/InputGroup",
  component: InputGroup,
  parameters: { layout: "centered" },
  tags: ["autodocs"],
} satisfies Meta<typeof InputGroup>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    placeholder: "Enter text...",
  },
};

export const WithPrefix: Story = {
  args: {
    prefix: "https://",
    placeholder: "example.com",
  },
};

export const WithSuffix: Story = {
  args: {
    suffix: ".com",
    placeholder: "domain",
  },
};

export const WithPrefixAndSuffix: Story = {
  args: {
    prefix: "$",
    suffix: "USD",
    placeholder: "0.00",
    type: "number",
  },
};

export const WithPrefixIcon: Story = {
  args: {
    prefixIcon: <Search />,
    placeholder: "Search...",
  },
};

export const WithSuffixIcon: Story = {
  args: {
    suffixIcon: <Mail />,
    placeholder: "Email address",
    type: "email",
  },
};

export const WithBothIcons: Story = {
  args: {
    prefixIcon: <DollarSign />,
    suffixIcon: <AtSign />,
    placeholder: "Amount",
  },
};

export const Disabled: Story = {
  args: {
    prefix: "https://",
    placeholder: "example.com",
    disabled: true,
  },
};
