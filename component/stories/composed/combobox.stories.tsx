import type { Meta, StoryObj } from '@storybook/react';
import { useState } from 'react';
import { Combobox } from '@/components/composed/combobox';

const frameworks = [
  { value: 'next.js', label: 'Next.js' },
  { value: 'sveltekit', label: 'SvelteKit' },
  { value: 'nuxt.js', label: 'Nuxt.js' },
  { value: 'remix', label: 'Remix' },
  { value: 'astro', label: 'Astro' },
];

const meta = {
  title: 'Composed/Combobox',
  component: Combobox,
  parameters: { layout: 'centered' },
  tags: ['autodocs'],
  argTypes: {
    placeholder: { control: 'text' },
    searchPlaceholder: { control: 'text' },
    emptyText: { control: 'text' },
    disabled: { control: 'boolean' },
  },
} satisfies Meta<typeof Combobox>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  render: (args) => {
    const [value, setValue] = useState('');
    return <Combobox {...args} value={value} onChange={setValue} />;
  },
  args: {
    options: frameworks,
    placeholder: 'Select framework...',
    searchPlaceholder: 'Search framework...',
  },
};

export const WithSelection: Story = {
  render: (args) => {
    const [value, setValue] = useState('next.js');
    return <Combobox {...args} value={value} onChange={setValue} />;
  },
  args: {
    options: frameworks,
  },
};

export const Disabled: Story = {
  args: {
    options: frameworks,
    disabled: true,
    placeholder: 'Disabled...',
  },
};

export const LongList: Story = {
  render: (args) => {
    const [value, setValue] = useState('');
    return <Combobox {...args} value={value} onChange={setValue} />;
  },
  args: {
    options: [
      { value: 'javascript', label: 'JavaScript' },
      { value: 'typescript', label: 'TypeScript' },
      { value: 'python', label: 'Python' },
      { value: 'rust', label: 'Rust' },
      { value: 'go', label: 'Go' },
      { value: 'java', label: 'Java' },
      { value: 'csharp', label: 'C#' },
      { value: 'cpp', label: 'C++' },
      { value: 'ruby', label: 'Ruby' },
      { value: 'swift', label: 'Swift' },
      { value: 'kotlin', label: 'Kotlin' },
      { value: 'php', label: 'PHP' },
    ],
    placeholder: 'Select language...',
    searchPlaceholder: 'Search languages...',
    className: 'w-[250px]',
  },
};
