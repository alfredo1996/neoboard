import type { Meta, StoryObj } from '@storybook/react';
import { TruncatedText } from '@/components/composed/truncated-text';

const meta = {
  title: 'Composed/TruncatedText',
  component: TruncatedText,
  parameters: { layout: 'centered' },
  tags: ['autodocs'],
  argTypes: {
    text: {
      control: 'text',
    },
    maxLength: {
      control: 'number',
    },
    showTooltip: {
      control: 'boolean',
    },
  },
} satisfies Meta<typeof TruncatedText>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    text: 'This is a very long text that should be truncated when it exceeds the container width.',
    className: 'w-[200px]',
  },
};

export const WithMaxLength: Story = {
  args: {
    text: 'This text will be truncated at 30 characters maximum.',
    maxLength: 30,
  },
};

export const InTable: Story = {
  args: { text: "Example text" },
  render: () => (
    <table className="w-[400px] border-collapse">
      <thead>
        <tr>
          <th className="border p-2 text-left w-[100px]">ID</th>
          <th className="border p-2 text-left">Description</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <td className="border p-2">001</td>
          <td className="border p-2">
            <TruncatedText
              text="A very long description that doesn't fit in the cell width and needs to be truncated with a tooltip"
              className="w-full"
            />
          </td>
        </tr>
        <tr>
          <td className="border p-2">002</td>
          <td className="border p-2">
            <TruncatedText text="Short text" className="w-full" />
          </td>
        </tr>
        <tr>
          <td className="border p-2">003</td>
          <td className="border p-2">
            <TruncatedText
              text="Another extremely long piece of text that demonstrates the truncation feature with tooltip on hover"
              className="w-full"
            />
          </td>
        </tr>
      </tbody>
    </table>
  ),
};

export const NoTooltip: Story = {
  args: {
    text: 'This text is truncated but without a tooltip.',
    maxLength: 25,
    showTooltip: false,
  },
};
