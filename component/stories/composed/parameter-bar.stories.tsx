import type { Meta, StoryObj } from '@storybook/react';
import { ParameterBar } from '@/components/composed/parameter-bar';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

const meta = {
  title: 'Composed/ParameterBar',
  component: ParameterBar,
  parameters: { layout: 'padded' },
  tags: ['autodocs'],
} satisfies Meta<typeof ParameterBar>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    onApply: () => console.log('Apply'),
    onReset: () => console.log('Reset'),
    children: null,
  },
  render: (args) => (
    <ParameterBar {...args}>
      <div className="flex items-center gap-2">
        <Label className="text-xs whitespace-nowrap">Start Date</Label>
        <Input type="date" className="w-[160px] h-8" />
      </div>
      <div className="flex items-center gap-2">
        <Label className="text-xs whitespace-nowrap">End Date</Label>
        <Input type="date" className="w-[160px] h-8" />
      </div>
      <div className="flex items-center gap-2">
        <Label className="text-xs whitespace-nowrap">Category</Label>
        <Select>
          <SelectTrigger className="w-[140px] h-8">
            <SelectValue placeholder="All" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All</SelectItem>
            <SelectItem value="sales">Sales</SelectItem>
            <SelectItem value="marketing">Marketing</SelectItem>
          </SelectContent>
        </Select>
      </div>
    </ParameterBar>
  ),
};

export const Vertical: Story = {
  args: {
    orientation: 'vertical',
    onApply: () => console.log('Apply'),
    onReset: () => console.log('Reset'),
    children: null,
  },
  render: (args) => (
    <div className="w-[250px]">
      <ParameterBar {...args}>
        <div className="space-y-1">
          <Label className="text-xs">Start Date</Label>
          <Input type="date" className="h-8" />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">End Date</Label>
          <Input type="date" className="h-8" />
        </div>
      </ParameterBar>
    </div>
  ),
};

export const NoButtons: Story = {
  args: { children: null },
  render: () => (
    <ParameterBar>
      <div className="flex items-center gap-2">
        <Label className="text-xs">Filter</Label>
        <Input className="w-[200px] h-8" placeholder="Search..." />
      </div>
    </ParameterBar>
  ),
};
