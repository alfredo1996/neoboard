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

// Tuning options (#1901): numbers carry their bounds and a unit, and an id
// suffix of the caller's choosing.
const ADVANCED_FIELDS: DynamicConnectionField[] = [
  {
    name: "connectionTimeout",
    id: "connection-timeout",
    label: "Connection Timeout",
    type: "number",
    placeholder: "30000",
    min: 1000,
    max: 300000,
    unit: "ms",
  },
  {
    name: "maxPoolSize",
    id: "max-pool-size",
    label: "Max Pool Size",
    type: "number",
    placeholder: "100",
    min: 1,
    max: 100,
  },
];

function ControlledDemo({
  fields = NEO4J_FIELDS,
  errors,
  className,
}: {
  fields?: DynamicConnectionField[];
  errors?: Record<string, string>;
  className?: string;
}) {
  const [values, setValues] = useState<
    Record<string, string | boolean | undefined>
  >({ protocol: "bolt" });
  return (
    <DynamicConnectionFields
      fields={fields}
      values={values}
      onChange={(name, value) =>
        setValues((prev) => ({ ...prev, [name]: value }))
      }
      errors={errors}
      className={className}
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

/** Bounded numbers with a unit, laid out in the caller's own two-column grid. */
export const NumberConstraints: Story = {
  args: { fields: ADVANCED_FIELDS, values: {}, onChange: () => {} },
  render: () => (
    <ControlledDemo
      fields={ADVANCED_FIELDS}
      className="grid gap-4 space-y-0 sm:grid-cols-2"
      errors={{ maxPoolSize: "Max Pool Size must be at most 100" }}
    />
  ),
};
