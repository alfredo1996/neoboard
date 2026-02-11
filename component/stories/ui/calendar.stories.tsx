"use client";
import * as React from 'react';
import type { Meta, StoryObj } from '@storybook/react';
import { Calendar } from '@/components/ui/calendar';

const meta = {
  title: 'UI/Calendar',
  component: Calendar,
  parameters: { layout: 'centered' },
  tags: ['autodocs'],
  argTypes: {
    mode: {
      control: 'select',
      options: ['single', 'multiple', 'range'],
      description: 'Selection mode for the calendar',
    },
    showOutsideDays: {
      control: 'boolean',
      description: 'Show days from adjacent months',
    },
    disabled: {
      control: 'boolean',
      description: 'Whether the calendar is disabled',
    },
    numberOfMonths: {
      control: 'number',
      description: 'Number of months to display',
    },
  },
  args: {
    showOutsideDays: true,
  },
} satisfies Meta<typeof Calendar>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  render: function CalendarStory() {
    const [date, setDate] = React.useState<Date | undefined>(new Date());
    return (
      <Calendar
        mode="single"
        selected={date}
        onSelect={setDate}
        className="rounded-md border shadow-sm"
      />
    );
  },
};

export const WithoutOutsideDays: Story = {
  args: { showOutsideDays: false },
  render: function CalendarNoOutside() {
    const [date, setDate] = React.useState<Date | undefined>(new Date());
    return (
      <Calendar
        mode="single"
        selected={date}
        onSelect={setDate}
        showOutsideDays={false}
        className="rounded-md border shadow-sm"
      />
    );
  },
};

export const MultipleMonths: Story = {
  render: function CalendarMultiple() {
    const [date, setDate] = React.useState<Date | undefined>(new Date());
    return (
      <Calendar
        mode="single"
        selected={date}
        onSelect={setDate}
        numberOfMonths={2}
        className="rounded-md border shadow-sm"
      />
    );
  },
};

export const DateRange: Story = {
  render: function CalendarRange() {
    const [range, setRange] = React.useState<{
      from: Date | undefined;
      to?: Date | undefined;
    }>({
      from: new Date(),
      to: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    });
    return (
      <Calendar
        mode="range"
        selected={range}
        onSelect={(newRange) => setRange(newRange || { from: undefined, to: undefined })}
        numberOfMonths={2}
        className="rounded-md border shadow-sm"
      />
    );
  },
};
