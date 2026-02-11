import type { Meta, StoryObj } from '@storybook/react';
import * as React from 'react';
import type {DateRange} from 'react-day-picker';
import { subDays } from 'date-fns';
import {DateRangePicker} from "../../src";

const meta = {
  title: 'Composed/DateRangePicker',
  component: DateRangePicker,
  parameters: { layout: 'centered' },
  tags: ['autodocs'],
  argTypes: {
    presets: { control: 'boolean' },
    placeholder: { control: 'text' },
    align: {
      control: 'select',
      options: ['start', 'center', 'end'],
    },
  },
} satisfies Meta<typeof DateRangePicker>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  render: (args) => {
    const [value, setValue] = React.useState<DateRange | undefined>();
    return <DateRangePicker {...args} value={value} onChange={setValue} />;
  },
  args: {},
};

export const WithPresets: Story = {
  render: (args) => {
    const [value, setValue] = React.useState<DateRange | undefined>();
    return <DateRangePicker {...args} value={value} onChange={setValue} />;
  },
  args: {
    presets: true,
  },
};

export const WithoutPresets: Story = {
  render: (args) => {
    const [value, setValue] = React.useState<DateRange | undefined>();
    return <DateRangePicker {...args} value={value} onChange={setValue} />;
  },
  args: {
    presets: false,
  },
};

export const WithInitialValue: Story = {
  render: (args) => {
    const [value, setValue] = React.useState<DateRange | undefined>({
      from: subDays(new Date(), 6),
      to: new Date(),
    });
    return <DateRangePicker {...args} value={value} onChange={setValue} />;
  },
  args: {},
};

export const CustomPlaceholder: Story = {
  render: (args) => {
    const [value, setValue] = React.useState<DateRange | undefined>();
    return <DateRangePicker {...args} value={value} onChange={setValue} />;
  },
  args: {
    placeholder: 'Select date range...',
  },
};
