import type { Meta, StoryObj } from '@storybook/react';
import { useState } from 'react';
import { FieldPicker } from '@/components/composed/field-picker';

const meta = {
  title: 'Composed/FieldPicker',
  component: FieldPicker,
  parameters: { layout: 'padded' },
  tags: ['autodocs'],
} satisfies Meta<typeof FieldPicker>;

export default meta;
type Story = StoryObj<typeof meta>;

const sampleFields = [
  { name: "id", type: "number" as const },
  { name: "name", type: "string" as const },
  { name: "email", type: "string" as const },
  { name: "age", type: "number" as const },
  { name: "createdAt", type: "date" as const },
  { name: "isActive", type: "boolean" as const },
  { name: "metadata", type: "object" as const },
];

export const Default: Story = {
  args: { fields: sampleFields },
  render: () => {
    const [selected, setSelected] = useState<string[]>(["name", "age"]);
    return (
      <div className="w-[250px] border rounded-md p-2">
        <FieldPicker
          fields={sampleFields}
          selected={selected}
          onSelect={(f) => setSelected([...selected, f])}
          onRemove={(f) => setSelected(selected.filter((s) => s !== f))}
        />
      </div>
    );
  },
};

export const Empty: Story = {
  args: { fields: [] },
  render: () => (
    <div className="w-[250px] border rounded-md p-2">
      <FieldPicker fields={[]} />
    </div>
  ),
};
