import type { Meta, StoryObj } from '@storybook/react';
import { Plus, Download, Filter, Search, RefreshCw } from 'lucide-react';
import { Toolbar, ToolbarSection, ToolbarSeparator } from '@/components/composed/toolbar';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

const meta = {
  title: 'Composed/Toolbar',
  component: Toolbar,
  parameters: { layout: 'padded' },
  tags: ['autodocs'],
} satisfies Meta<typeof Toolbar>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: { children: null },
  render: () => (
    <Toolbar>
      <ToolbarSection>
        <Button size="sm" variant="outline">
          <Filter className="mr-2 h-4 w-4" />
          Filter
        </Button>
        <Button size="sm" variant="outline">
          <Download className="mr-2 h-4 w-4" />
          Export
        </Button>
      </ToolbarSection>
      <ToolbarSeparator />
      <ToolbarSection>
        <Button size="sm">
          <Plus className="mr-2 h-4 w-4" />
          Add Widget
        </Button>
      </ToolbarSection>
    </Toolbar>
  ),
};

export const WithSearch: Story = {
  args: { children: null },
  render: () => (
    <Toolbar>
      <ToolbarSection>
        <div className="relative w-64">
          <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input placeholder="Search widgets..." className="pl-8 h-8" />
        </div>
      </ToolbarSection>
      <ToolbarSeparator />
      <ToolbarSection>
        <Button size="sm" variant="outline">
          <Filter className="mr-2 h-4 w-4" />
          Filters
        </Button>
      </ToolbarSection>
      <ToolbarSection className="ml-auto">
        <Button size="sm" variant="ghost">
          <RefreshCw className="mr-2 h-4 w-4" />
          Refresh
        </Button>
        <Button size="sm">
          <Plus className="mr-2 h-4 w-4" />
          New
        </Button>
      </ToolbarSection>
    </Toolbar>
  ),
};
