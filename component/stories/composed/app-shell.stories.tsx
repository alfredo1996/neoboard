import type { Meta, StoryObj } from "@storybook/react";
import { useState } from "react";
import {
  Home,
  BarChart3,
  Settings,
  Users,
  Plus,
  Download,
  Bell,
} from "lucide-react";
import { AppShell } from "@/components/composed/app-shell";
import { Sidebar } from "@/components/composed/sidebar";
import {
  SidebarItem,
  SidebarSectionLabel,
  Wordmark,
} from "@/components/composed/sidebar-item";
import {
  Toolbar,
  ToolbarSection,
  ToolbarSeparator,
} from "@/components/composed/toolbar";
import { DashboardGrid } from "@/components/composed/dashboard-grid";
import { WidgetCard } from "@/components/composed/widget-card";
import { LineChart } from "@/charts/line-chart";
import { BarChart } from "@/charts/bar-chart";
import { Button } from "@/components/ui/button";
import { Card, CardKpi } from "@/components/ui/card";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";

const meta = {
  title: "Composed/AppShell",
  component: AppShell,
  parameters: { layout: "fullscreen" },
  tags: ["autodocs"],
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
              header={
                !collapsed ? (
                  <span className="text-lg font-bold px-1">NeoBoard</span>
                ) : undefined
              }
            >
              <SidebarItem
                icon={<Home className="h-4 w-4" />}
                label="Dashboard"
                active
                collapsed={collapsed}
              />
              <SidebarItem
                icon={<BarChart3 className="h-4 w-4" />}
                label="Analytics"
                collapsed={collapsed}
              />
              <SidebarItem
                icon={<Users className="h-4 w-4" />}
                label="Users"
                badge={12}
                collapsed={collapsed}
              />
              <SidebarItem
                icon={<Bell className="h-4 w-4" />}
                label="Notifications"
                badge={3}
                collapsed={collapsed}
              />
              <SidebarItem
                icon={<Settings className="h-4 w-4" />}
                label="Settings"
                collapsed={collapsed}
              />
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
            <p className="text-muted-foreground">
              Main content area. Place dashboard grids, tables, or other content
              here.
            </p>
          </div>
        </AppShell>
      </div>
    );
  },
};

const dashboardLayout = [
  { i: "stat-1", x: 0, y: 0, w: 3, h: 2 },
  { i: "stat-2", x: 3, y: 0, w: 3, h: 2 },
  { i: "stat-3", x: 6, y: 0, w: 3, h: 2 },
  { i: "stat-4", x: 9, y: 0, w: 3, h: 2 },
  { i: "line", x: 0, y: 2, w: 8, h: 4 },
  { i: "bar", x: 8, y: 2, w: 4, h: 4 },
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
              header={<Wordmark collapsed={collapsed} />}
              footer={
                !collapsed ? (
                  <span className="text-xs text-muted-foreground">v1.1.0</span>
                ) : undefined
              }
            >
              <SidebarSectionLabel label="Workspace" collapsed={collapsed} />
              <SidebarItem
                icon={<Home className="h-4 w-4" />}
                label="Dashboards"
                active
                collapsed={collapsed}
              />
              <SidebarItem
                icon={<BarChart3 className="h-4 w-4" />}
                label="Analytics"
                collapsed={collapsed}
              />
              <SidebarItem
                icon={<Bell className="h-4 w-4" />}
                label="Notifications"
                badge={3}
                collapsed={collapsed}
              />
              <SidebarSectionLabel label="Admin" collapsed={collapsed} />
              <SidebarItem
                icon={<Users className="h-4 w-4" />}
                label="Users"
                badge={24}
                collapsed={collapsed}
              />
              <SidebarItem
                icon={<Settings className="h-4 w-4" />}
                label="Settings"
                collapsed={collapsed}
              />
            </Sidebar>
          }
          header={
            <Toolbar>
              <ToolbarSection>
                <h2 className="font-display text-lg font-semibold tracking-tight">
                  Revenue Overview
                </h2>
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
              <ToolbarSeparator />
              <ToolbarSection>
                <Avatar className="h-8 w-8">
                  <AvatarFallback>AD</AvatarFallback>
                </Avatar>
              </ToolbarSection>
            </Toolbar>
          }
        >
          {/* 4-col KPI row + 2:1 chart row (#832) — plain CSS grid, no
              orphans, compact left-aligned KPIs from #825. */}
          <div className="space-y-4 p-6">
            <div className="grid grid-cols-4 gap-4">
              <Card density="compact" interactive>
                <CardKpi
                  label="Revenue"
                  value="$45,231"
                  trend={12.4}
                  trendLabel="vs last month"
                />
              </Card>
              <Card density="compact" interactive>
                <CardKpi label="Users" value="2,350" trend={4.1} />
              </Card>
              <Card density="compact" interactive>
                <CardKpi label="Orders" value="1,247" trend={-1.8} />
              </Card>
              <Card density="compact" interactive>
                <CardKpi label="Conversion" value="3.2%" trend={0.4} />
              </Card>
            </div>
            <div className="grid grid-cols-3 gap-4">
              <div className="col-span-2 h-[320px]">
                <WidgetCard title="Revenue Over Time" subtitle="Monthly trend">
                  <LineChart data={revenueData} smooth area />
                </WidgetCard>
              </div>
              <div className="h-[320px]">
                <WidgetCard title="Sales by Category">
                  <BarChart data={categoryData} />
                </WidgetCard>
              </div>
            </div>
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
