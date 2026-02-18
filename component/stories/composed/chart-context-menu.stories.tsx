import type { Meta, StoryObj } from '@storybook/react';
import { ChartContextMenu } from '@/components/composed/chart-context-menu';
import { Eye, Filter, Download, Trash2 } from 'lucide-react';

const meta = {
  title: 'Composed/ChartContextMenu',
  component: ChartContextMenu,
  parameters: { layout: 'centered' },
  tags: ['autodocs'],
} satisfies Meta<typeof ChartContextMenu>;

export default meta;
type Story = StoryObj<typeof meta>;

const sampleGroups = [
  {
    items: [
      { label: 'Drill Down', onClick: () => console.log('Drill'), icon: <Eye className="h-4 w-4" /> },
      { label: 'Filter By', onClick: () => console.log('Filter'), icon: <Filter className="h-4 w-4" /> },
      { label: 'Export', onClick: () => console.log('Export'), icon: <Download className="h-4 w-4" /> },
    ],
  },
  {
    items: [
      { label: 'Remove', onClick: () => console.log('Remove'), icon: <Trash2 className="h-4 w-4" />, destructive: true },
    ],
  },
];

export const Default: Story = {
  args: {
    groups: sampleGroups,
    children: null,
  },
  render: (args) => (
    <ChartContextMenu {...args}>
      <div className="w-[300px] h-[200px] bg-muted rounded-lg flex items-center justify-center text-muted-foreground border border-dashed">
        Right-click here
      </div>
    </ChartContextMenu>
  ),
};

export const SimpleMenu: Story = {
  args: {
    groups: [
      {
        items: [
          { label: 'View Details', onClick: () => {} },
          { label: 'Copy Value', onClick: () => {} },
        ],
      },
    ],
    children: null,
  },
  render: (args) => (
    <ChartContextMenu {...args}>
      <div className="w-[300px] h-[200px] bg-muted rounded-lg flex items-center justify-center text-muted-foreground border border-dashed">
        Right-click for simple menu
      </div>
    </ChartContextMenu>
  ),
};
