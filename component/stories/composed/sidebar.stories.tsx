import type { Meta, StoryObj } from '@storybook/react';
import { useState } from 'react';
import { Home, BarChart3, Settings, Users, Bell } from 'lucide-react';
import { Sidebar } from '@/components/composed/sidebar';
import { SidebarItem } from '@/components/composed/sidebar-item';

const meta = {
  title: 'Composed/Sidebar',
  component: Sidebar,
  parameters: { layout: 'fullscreen' },
  tags: ['autodocs'],
} satisfies Meta<typeof Sidebar>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    header: <span className="text-lg font-bold px-1">NeoBoard</span>,
    children: null,
  },
  render: (args) => (
    <div style={{ height: 400 }}>
      <Sidebar {...args}>
        <SidebarItem icon={<Home className="h-4 w-4" />} label="Dashboard" active />
        <SidebarItem icon={<BarChart3 className="h-4 w-4" />} label="Analytics" />
        <SidebarItem icon={<Users className="h-4 w-4" />} label="Users" badge={12} />
        <SidebarItem icon={<Bell className="h-4 w-4" />} label="Notifications" badge={3} />
        <SidebarItem icon={<Settings className="h-4 w-4" />} label="Settings" />
      </Sidebar>
    </div>
  ),
};

export const Collapsible: Story = {
  args: { children: null },
  render: () => {
    const [collapsed, setCollapsed] = useState(false);
    return (
      <div style={{ height: 400 }}>
        <Sidebar
          collapsed={collapsed}
          onCollapsedChange={setCollapsed}
          header={!collapsed ? <span className="text-lg font-bold px-1">NeoBoard</span> : undefined}
          footer={!collapsed ? <span className="text-xs text-muted-foreground">v1.0.0</span> : undefined}
        >
          <SidebarItem icon={<Home className="h-4 w-4" />} label="Dashboard" active collapsed={collapsed} />
          <SidebarItem icon={<BarChart3 className="h-4 w-4" />} label="Analytics" collapsed={collapsed} />
          <SidebarItem icon={<Users className="h-4 w-4" />} label="Users" badge={12} collapsed={collapsed} />
          <SidebarItem icon={<Settings className="h-4 w-4" />} label="Settings" collapsed={collapsed} />
        </Sidebar>
      </div>
    );
  },
};
