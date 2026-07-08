import type { Meta, StoryObj } from "@storybook/react";
import { useState } from "react";
import { FormWidget } from "@/components/composed/form-widget";

const meta = {
  title: "Composed/FormWidget",
  component: FormWidget,
  parameters: { layout: "centered" },
  tags: ["autodocs"],
  decorators: [
    (Story) => (
      <div className="w-80 rounded-lg border">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof FormWidget>;

export default meta;
type Story = StoryObj<typeof meta>;

const FIELDS = [
  { name: "rating", label: "Rating (1–5)", type: "number" as const },
  { name: "category", label: "Category", type: "text" as const },
  { name: "comment", label: "Comment", type: "text" as const },
];

function ControlledDemo(props: {
  isSubmitting?: boolean;
  successMessage?: string | null;
  errorMessage?: string | null;
}) {
  const [values, setValues] = useState<Record<string, string>>({});
  return (
    <FormWidget
      fields={FIELDS}
      values={values}
      onFieldChange={(name, value) =>
        setValues((prev) => ({ ...prev, [name]: value }))
      }
      onSubmit={() => {}}
      submitButtonText="Submit feedback"
      {...props}
    />
  );
}

export const Default: Story = {
  args: {
    fields: FIELDS,
    values: {},
    onFieldChange: () => {},
    onSubmit: () => {},
  },
  render: () => <ControlledDemo />,
};

export const Submitting: Story = {
  args: Default.args,
  render: () => <ControlledDemo isSubmitting />,
};

export const Success: Story = {
  args: Default.args,
  render: () => <ControlledDemo successMessage="Thanks! Feedback saved." />,
};

export const ErrorState: Story = {
  args: Default.args,
  render: () => (
    <ControlledDemo errorMessage='The field "rating" is required.' />
  ),
};
