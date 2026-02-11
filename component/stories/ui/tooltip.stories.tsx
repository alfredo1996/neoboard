import type { Meta, StoryObj } from '@storybook/react';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { Button } from '@/components/ui/button';

const meta = {
  title: 'UI/Tooltip',
  component: Tooltip,
  parameters: { layout: 'centered' },
  tags: ['autodocs'],
  decorators: [
    (Story) => (
      <TooltipProvider>
        <Story />
      </TooltipProvider>
    ),
  ],
} satisfies Meta<typeof Tooltip>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  render: () => (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button variant="outline">Hover me</Button>
      </TooltipTrigger>
      <TooltipContent>
        <p>Add to library</p>
      </TooltipContent>
    </Tooltip>
  ),
};

export const Sides: Story = {
  render: () => (
    <div className="flex gap-4">
      <Tooltip>
        <TooltipTrigger asChild><Button variant="outline">Top</Button></TooltipTrigger>
        <TooltipContent side="top"><p>Top tooltip</p></TooltipContent>
      </Tooltip>
      <Tooltip>
        <TooltipTrigger asChild><Button variant="outline">Right</Button></TooltipTrigger>
        <TooltipContent side="right"><p>Right tooltip</p></TooltipContent>
      </Tooltip>
      <Tooltip>
        <TooltipTrigger asChild><Button variant="outline">Bottom</Button></TooltipTrigger>
        <TooltipContent side="bottom"><p>Bottom tooltip</p></TooltipContent>
      </Tooltip>
      <Tooltip>
        <TooltipTrigger asChild><Button variant="outline">Left</Button></TooltipTrigger>
        <TooltipContent side="left"><p>Left tooltip</p></TooltipContent>
      </Tooltip>
    </div>
  ),
};
