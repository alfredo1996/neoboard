import type { Meta, StoryObj } from "@storybook/react";
import { useState } from "react";
import { MultiSelect } from "@/components/composed/multi-select";

const frameworks = [
  { value: "react", label: "React" },
  { value: "vue", label: "Vue" },
  { value: "angular", label: "Angular" },
  { value: "svelte", label: "Svelte" },
  { value: "solid", label: "Solid" },
  { value: "preact", label: "Preact" },
];

const meta = {
  title: "Composed/MultiSelect",
  component: MultiSelect,
  parameters: {
    layout: "centered",
    docs: {
      description: {
        component:
          "**Keyboard (#1128):** `Tab` focuses the trigger · `Enter`/`Space` opens · type to filter · `ArrowUp`/`ArrowDown` move the highlight · `Enter` toggles the option (stays open for multi-pick) · `Escape` closes · badge remove buttons are tabbable.",
      },
    },
  },
  tags: ["autodocs"],
  argTypes: {
    placeholder: { control: "text" },
    searchPlaceholder: { control: "text" },
    emptyText: { control: "text" },
    disabled: { control: "boolean" },
    maxDisplay: { control: "number" },
  },
} satisfies Meta<typeof MultiSelect>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  render: (args) => {
    const [value, setValue] = useState<string[]>([]);
    return <MultiSelect {...args} value={value} onChange={setValue} />;
  },
  args: {
    options: frameworks,
    placeholder: "Select frameworks...",
  },
};

export const WithSelection: Story = {
  render: (args) => {
    const [value, setValue] = useState<string[]>(["react", "vue"]);
    return <MultiSelect {...args} value={value} onChange={setValue} />;
  },
  args: {
    options: frameworks,
  },
};

export const ManySelected: Story = {
  render: (args) => {
    const [value, setValue] = useState<string[]>([
      "react",
      "vue",
      "angular",
      "svelte",
      "solid",
    ]);
    return <MultiSelect {...args} value={value} onChange={setValue} />;
  },
  args: {
    options: frameworks,
    maxDisplay: 3,
  },
};

export const Disabled: Story = {
  args: {
    options: frameworks,
    value: ["react"],
    disabled: true,
  },
};

export const CustomMaxDisplay: Story = {
  render: (args) => {
    const [value, setValue] = useState<string[]>([
      "react",
      "vue",
      "angular",
      "svelte",
    ]);
    return <MultiSelect {...args} value={value} onChange={setValue} />;
  },
  args: {
    options: frameworks,
    maxDisplay: 2,
  },
};

// #902: per-option renderer lets callers add inline badges (e.g. widget
// title + chart-type badge). The form widget's "refresh widgets" picker
// uses this pattern.
export const WithRenderOption: Story = {
  render: (args) => {
    const [value, setValue] = useState<string[]>([]);
    return (
      <MultiSelect
        {...args}
        value={value}
        onChange={setValue}
        renderOption={(opt) => (
          <span
            style={{ display: "flex", flex: 1, alignItems: "center", gap: 6 }}
          >
            <span>{opt.label}</span>
            <span
              style={{
                fontSize: 10,
                padding: "1px 6px",
                border: "1px solid hsl(var(--border))",
                borderRadius: 4,
                color: "hsl(var(--muted-foreground))",
              }}
            >
              {opt.value}
            </span>
          </span>
        )}
      />
    );
  },
  args: {
    options: frameworks,
    placeholder: "Select frameworks…",
  },
};
