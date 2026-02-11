import type { Meta, StoryObj } from '@storybook/react';
import { useState } from 'react';
import { MultiSelect } from '@/components/composed/multi-select';

const frameworks = [
  { value: 'react', label: 'React' },
  { value: 'vue', label: 'Vue' },
  { value: 'angular', label: 'Angular' },
  { value: 'svelte', label: 'Svelte' },
  { value: 'solid', label: 'Solid' },
  { value: 'preact', label: 'Preact' },
];

const meta = {
  title: 'Composed/MultiSelect',
  component: MultiSelect,
  parameters: { layout: 'centered' },
  tags: ['autodocs'],
  argTypes: {
    placeholder: { control: 'text' },
    searchPlaceholder: { control: 'text' },
    emptyText: { control: 'text' },
    disabled: { control: 'boolean' },
    maxDisplay: { control: 'number' },
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
    placeholder: 'Select frameworks...',
  },
};

export const WithSelection: Story = {
  render: (args) => {
    const [value, setValue] = useState<string[]>(['react', 'vue']);
    return <MultiSelect {...args} value={value} onChange={setValue} />;
  },
  args: {
    options: frameworks,
  },
};

export const ManySelected: Story = {
  render: (args) => {
    const [value, setValue] = useState<string[]>([
      'react',
      'vue',
      'angular',
      'svelte',
      'solid',
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
    value: ['react'],
    disabled: true,
  },
};

export const CustomMaxDisplay: Story = {
  render: (args) => {
    const [value, setValue] = useState<string[]>([
      'react',
      'vue',
      'angular',
      'svelte',
    ]);
    return <MultiSelect {...args} value={value} onChange={setValue} />;
  },
  args: {
    options: frameworks,
    maxDisplay: 2,
  },
};
