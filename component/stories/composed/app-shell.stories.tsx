import type { Meta, StoryObj } from '@storybook/react';
import { useState } from 'react';
import { Home, BarChart3, Settings, Users, Plus, Download, Bell } from 'lucide-react';
import { AppShell } from '@/components/composed/app-shell';
import { Sidebar } from '@/components/composed/sidebar';
import { SidebarItem } from '@/components/composed/sidebar-item';
import { Toolbar, ToolbarSection, ToolbarSeparator } from '@/components/composed/toolbar';
import { DashboardGrid } from '@/components/composed/dashboard-grid';
import { WidgetCard } from '@/components/composed/widget-card';
import { StatCard } from '@/components/composed/stat-card';
import { LineChart } from '@/charts/line-chart';
import { BarChart } from '@/charts/bar-chart';
import { Button } from '@/components/ui/button';

const meta = {
  title: 'Composed/AppShell',
  component: AppShell,
  parameters: { layout: 'fullscreen' },
  tags: ['autodocs'],
} satisfies Meta<typeof AppShell>;

export default meta;
type Story = StoryObj<typeof meta>;

const revenueData = [
  { x: "Jan", y: 4200 },
  { x: "Feb", y: 3800 },
  { x: "Mar", y: 5100 },
  { x: "Apr", y: 4600 },
  { x: "May", y: 5400 },
  { x: "Jun", y: 7200 },
];

const categoryData = [
  { label: "Electronics", value: 4200 },
  { label: "Clothing", value: 3100 },
  { label: "Books", value: 1800 },
  { label: "Home", value: 2400 },
];

export const Default: Story = {
  args: { children: null },
  render: () => {
    const [collapsed, setCollapsed] = useState(false);
    return (
      <div style={{ height: 500 }}>
        <AppShell
          sidebar={
            <Sidebar
              collapsed={collapsed}
              onCollapsedChange={setCollapsed}
              header={!collapsed ? <span className="text-lg font-bold px-1">NeoBoard</span> : undefined}
            >
              <SidebarItem icon={<Home className="h-4 w-4" />} label="Dashboard" active collapsed={collapsed} />
              <SidebarItem icon={<BarChart3 className="h-4 w-4" />} label="Analytics" collapsed={collapsed} />
              <SidebarItem icon={<Users className="h-4 w-4" />} label="Users" badge={12} collapsed={collapsed} />
              <SidebarItem icon={<Bell className="h-4 w-4" />} label="Notifications" badge={3} collapsed={collapsed} />
              <SidebarItem icon={<Settings className="h-4 w-4" />} label="Settings" collapsed={collapsed} />
            </Sidebar>
          }
          header={
            <Toolbar>
              <ToolbarSection>
                <h2 className="text-lg font-semibold">Dashboard</h2>
              </ToolbarSection>
              <ToolbarSection className="ml-auto">
                <Button size="sm" variant="outline">
                  <Download className="mr-2 h-4 w-4" />
                  Export
                </Button>
                <Button size="sm">
                  <Plus className="mr-2 h-4 w-4" />
                  Add Widget
                </Button>
              </ToolbarSection>
            </Toolbar>
          }
        >
          <div className="p-6">
            <p className="text-muted-foreground">Main content area. Place dashboard grids, tables, or other content here.</p>
          </div>
        </AppShell>
      </div>
    );
  },
};

const dashboardLayout = [
  { i: 'stat-1', x: 0, y: 0, w: 3, h: 2 },
  { i: 'stat-2', x: 3, y: 0, w: 3, h: 2 },
  { i: 'stat-3', x: 6, y: 0, w: 3, h: 2 },
  { i: 'stat-4', x: 9, y: 0, w: 3, h: 2 },
  { i: 'line', x: 0, y: 2, w: 8, h: 4 },
  { i: 'bar', x: 8, y: 2, w: 4, h: 4 },
];

export const FullDashboard: Story = {
  args: { children: null },
  render: () => {
    const [collapsed, setCollapsed] = useState(false);
    return (
      <div style={{ height: 700 }}>
        <AppShell
          sidebar={
            <Sidebar
              collapsed={collapsed}
              onCollapsedChange={setCollapsed}
              header={!collapsed ? <span className="text-lg font-bold px-1">NeoBoard</span> : undefined}
              footer={!collapsed ? <span className="text-xs text-muted-foreground">v1.0.0</span> : undefined}
            >
              <SidebarItem icon={<Home className="h-4 w-4" />} label="Dashboard" active collapsed={collapsed} />
              <SidebarItem icon={<BarChart3 className="h-4 w-4" />} label="Analytics" collapsed={collapsed} />
              <SidebarItem icon={<Users className="h-4 w-4" />} label="Users" badge={24} collapsed={collapsed} />
              <SidebarItem icon={<Settings className="h-4 w-4" />} label="Settings" collapsed={collapsed} />
            </Sidebar>
          }
          header={
            <Toolbar>
              <ToolbarSection>
                <h2 className="text-lg font-semibold">Dashboard</h2>
              </ToolbarSection>
              <ToolbarSeparator />
              <ToolbarSection className="ml-auto">
                <Button size="sm" variant="outline">
                  <Download className="mr-2 h-4 w-4" />
                  Export
                </Button>
                <Button size="sm">
                  <Plus className="mr-2 h-4 w-4" />
                  Add Widget
                </Button>
              </ToolbarSection>
            </Toolbar>
          }
        >
          <div className="p-4">
            <DashboardGrid layout={dashboardLayout} rowHeight={60} isDraggable={false} isResizable={false}>
              <div key="stat-1">
                <StatCard title="Revenue" value="$45,231" trend={{ value: 12.5, label: "vs last month" }} className="h-full" />
              </div>
              <div key="stat-2">
                <StatCard title="Users" value="2,350" trend={{ value: 8.2, label: "vs last month" }} className="h-full" />
              </div>
              <div key="stat-3">
                <StatCard title="Orders" value="1,247" trend={{ value: -3.1, label: "vs last month" }} className="h-full" />
              </div>
              <div key="stat-4">
                <StatCard title="Conversion" value="3.2%" trend={{ value: 0 }} description="No change" className="h-full" />
              </div>
              <div key="line">
                <WidgetCard title="Revenue Over Time" subtitle="Monthly trend">
                  <LineChart data={revenueData} smooth area />
                </WidgetCard>
              </div>
              <div key="bar">
                <WidgetCard title="Sales by Category">
                  <BarChart data={categoryData} showValues />
                </WidgetCard>
              </div>
            </DashboardGrid>
          </div>
        </AppShell>
      </div>
    );
  },
};

export const WithoutSidebar: Story = {
  args: { children: null },
  render: () => (
    <div style={{ height: 400 }}>
      <AppShell
        header={
          <Toolbar>
            <ToolbarSection>
              <h2 className="text-lg font-semibold">Page Title</h2>
            </ToolbarSection>
          </Toolbar>
        }
      >
        <div className="p-6">
          <p className="text-muted-foreground">Content without sidebar.</p>
        </div>
      </AppShell>
    </div>
  ),
};
