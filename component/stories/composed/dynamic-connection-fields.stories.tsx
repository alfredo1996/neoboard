import type { Meta, StoryObj } from "@storybook/react";
import { useState } from "react";
import { DynamicConnectionFields } from "@/components/composed/dynamic-connection-fields";
import type { DynamicConnectionField } from "@/components/composed/dynamic-connection-fields";

const meta = {
  title: "Composed/DynamicConnectionFields",
  component: DynamicConnectionFields,
  parameters: { layout: "centered" },
  tags: ["autodocs"],
  decorators: [
    (Story) => (
      <div className="w-96">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof DynamicConnectionFields>;

export default meta;
type Story = StoryObj<typeof meta>;

// The Neo4j connector's formFields shape (#1118) — text, password, select,
// and boolean field types.
const NEO4J_FIELDS: DynamicConnectionField[] = [
  {
    name: "uri",
    label: "Bolt URI",
    type: "text",
    required: true,
    placeholder: "bolt://localhost:7687",
  },
  {
    name: "username",
    label: "Username",
    type: "text",
    required: true,
    placeholder: "neo4j",
  },
  { name: "password", label: "Password", type: "password", required: true },
  {
    name: "database",
    label: "Database",
    type: "text",
    placeholder: "neo4j",
    description: "Leave empty for the default database.",
  },
  {
    name: "protocol",
    label: "Protocol",
    type: "select",
    options: [
      { label: "bolt", value: "bolt" },
      { label: "neo4j (routing)", value: "neo4j" },
    ],
  },
  { name: "encrypted", label: "Encrypted connection", type: "boolean" },
];

function ControlledDemo({ errors }: { errors?: Record<string, string> }) {
  const [values, setValues] = useState<
    Record<string, string | boolean | undefined>
  >({ protocol: "bolt" });
  return (
    <DynamicConnectionFields
      fields={NEO4J_FIELDS}
      values={values}
      onChange={(name, value) =>
        setValues((prev) => ({ ...prev, [name]: value }))
      }
      errors={errors}
    />
  );
}

export const Default: Story = {
  args: { fields: NEO4J_FIELDS, values: {}, onChange: () => {} },
  render: () => <ControlledDemo />,
};

export const WithErrors: Story = {
  args: Default.args,
  render: () => (
    <ControlledDemo
      errors={{
        uri: "URI is required",
        password: "Password is required",
      }}
    />
  ),
};
