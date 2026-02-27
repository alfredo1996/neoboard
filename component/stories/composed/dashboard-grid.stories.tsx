import type { Meta, StoryObj } from '@storybook/react';
import { DashboardGrid } from '@/components/composed/dashboard-grid';
import { WidgetCard } from '@/components/composed/widget-card';
import { LineChart } from '@/charts/line-chart';
import { BarChart } from '@/charts/bar-chart';
import { PieChart } from '@/charts/pie-chart';

const meta = {
  title: 'Composed/DashboardGrid',
  component: DashboardGrid,
  parameters: { layout: 'fullscreen' },
  tags: ['autodocs'],
} satisfies Meta<typeof DashboardGrid>;

export default meta;
type Story = StoryObj<typeof meta>;

const revenueData = [
  { x: "Jan", y: 4200 },
  { x: "Feb", y: 3800 },
  { x: "Mar", y: 5100 },
  { x: "Apr", y: 4600 },
  { x: "May", y: 5400 },
  { x: "Jun", y: 7200 },
  { x: "Jul", y: 6800 },
  { x: "Aug", y: 7400 },
  { x: "Sep", y: 6900 },
  { x: "Oct", y: 8100 },
  { x: "Nov", y: 7600 },
  { x: "Dec", y: 9200 },
];

const categoryData = [
  { label: "Electronics", value: 4200 },
  { label: "Clothing", value: 3100 },
  { label: "Books", value: 1800 },
  { label: "Home", value: 2400 },
  { label: "Sports", value: 1500 },
];

const trafficData = [
  { name: "Direct", value: 335 },
  { name: "Search", value: 580 },
  { name: "Social", value: 234 },
  { name: "Referral", value: 154 },
];

const simpleLayout = [
  { i: 'revenue', x: 0, y: 0, w: 6, h: 3 },
  { i: 'users', x: 6, y: 0, w: 6, h: 3 },
  { i: 'orders', x: 0, y: 3, w: 12, h: 3 },
];

export const Default: Story = {
  args: {
    layout: simpleLayout,
    children: null,
  },
  render: (args) => (
    <div style={{ padding: 16 }}>
      <DashboardGrid {...args} layout={simpleLayout}>
        <div key="revenue">
          <WidgetCard title="Revenue" subtitle="Last 30 days">
            <div className="flex items-center justify-center h-full text-2xl font-bold">
              $45,231
            </div>
          </WidgetCard>
        </div>
        <div key="users">
          <WidgetCard title="Active Users" subtitle="This week">
            <div className="flex items-center justify-center h-full text-2xl font-bold">
              2,350
            </div>
          </WidgetCard>
        </div>
        <div key="orders">
          <WidgetCard title="Recent Orders">
            <div className="flex items-center justify-center h-full text-muted-foreground">
              Table content goes here
            </div>
          </WidgetCard>
        </div>
      </DashboardGrid>
    </div>
  ),
};

const chartsLayout = [
  { i: 'stat-revenue', x: 0, y: 0, w: 3, h: 2, minW: 2, minH: 2 },
  { i: 'stat-users', x: 3, y: 0, w: 3, h: 2, minW: 2, minH: 2 },
  { i: 'stat-orders', x: 6, y: 0, w: 3, h: 2, minW: 2, minH: 2 },
  { i: 'stat-conversion', x: 9, y: 0, w: 3, h: 2, minW: 2, minH: 2 },
  { i: 'line-chart', x: 0, y: 2, w: 8, h: 4, minW: 4, minH: 3 },
  { i: 'pie-chart', x: 8, y: 2, w: 4, h: 4, minW: 3, minH: 3 },
  { i: 'bar-chart', x: 0, y: 6, w: 12, h: 4, minW: 3, minH: 3 },
];

export const WithCharts: Story = {
  args: {
    layout: chartsLayout,
    children: null,
  },
  render: () => (
    <div style={{ padding: 16 }}>
      <DashboardGrid layout={chartsLayout} rowHeight={60}>
        <div key="stat-revenue">
          <div className="flex h-full flex-col items-center justify-center rounded-lg border p-4">
            <span className="text-sm text-muted-foreground">Revenue</span>
            <span className="text-2xl font-bold">$45,231</span>
          </div>
        </div>
        <div key="stat-users">
          <div className="flex h-full flex-col items-center justify-center rounded-lg border p-4">
            <span className="text-sm text-muted-foreground">Active Users</span>
            <span className="text-2xl font-bold">2,350</span>
          </div>
        </div>
        <div key="stat-orders">
          <div className="flex h-full flex-col items-center justify-center rounded-lg border p-4">
            <span className="text-sm text-muted-foreground">Orders</span>
            <span className="text-2xl font-bold">1,247</span>
          </div>
        </div>
        <div key="stat-conversion">
          <div className="flex h-full flex-col items-center justify-center rounded-lg border p-4">
            <span className="text-sm text-muted-foreground">Conversion</span>
            <span className="text-2xl font-bold">3.2%</span>
          </div>
        </div>
        <div key="line-chart">
          <WidgetCard
            title="Revenue Over Time"
            subtitle="Monthly trend"
            actions={[
              { label: "Export CSV", onClick: () => {} },
              { label: "Remove", onClick: () => {}, destructive: true },
            ]}
          >
            <LineChart data={revenueData} smooth area />
          </WidgetCard>
        </div>
        <div key="pie-chart">
          <WidgetCard title="Traffic Sources">
            <PieChart data={trafficData} donut showLegend />
          </WidgetCard>
        </div>
        <div key="bar-chart">
          <WidgetCard
            title="Sales by Category"
            subtitle="Current quarter"
            draggable
          >
            <BarChart data={categoryData} showValues />
          </WidgetCard>
        </div>
      </DashboardGrid>
    </div>
  ),
};

const handleLayout = [
  { i: 'revenue', x: 0, y: 0, w: 4, h: 3 },
  { i: 'users', x: 4, y: 0, w: 4, h: 3 },
  { i: 'orders', x: 8, y: 0, w: 4, h: 3 },
  { i: 'chart', x: 0, y: 3, w: 12, h: 4, minH: 3 },
];

export const WithDragHandle: Story = {
  args: { layout: handleLayout, children: null },
  render: () => (
    <div style={{ padding: 16 }}>
      <p className="mb-3 text-sm text-muted-foreground">
        Only the <strong>grip icon</strong> in each card header triggers dragging — clicking anywhere else on the card does not move it.
      </p>
      <DashboardGrid layout={handleLayout}>
        <div key="revenue">
          <WidgetCard title="Revenue" subtitle="Last 30 days" draggable actions={[{ label: 'Edit', onClick: () => {} }]}>
            <div className="flex items-center justify-center h-full text-2xl font-bold">$45,231</div>
          </WidgetCard>
        </div>
        <div key="users">
          <WidgetCard title="Active Users" subtitle="This week" draggable actions={[{ label: 'Edit', onClick: () => {} }]}>
            <div className="flex items-center justify-center h-full text-2xl font-bold">2,350</div>
          </WidgetCard>
        </div>
        <div key="orders">
          <WidgetCard title="Orders" subtitle="Pending" draggable actions={[{ label: 'Edit', onClick: () => {} }]}>
            <div className="flex items-center justify-center h-full text-2xl font-bold">128</div>
          </WidgetCard>
        </div>
        <div key="chart">
          <WidgetCard
            title="Revenue Over Time"
            subtitle="Monthly trend"
            draggable
            actions={[
              { label: 'Export CSV', onClick: () => {} },
              { label: 'Remove', onClick: () => {}, destructive: true },
            ]}
          >
            <LineChart data={revenueData} smooth area />
          </WidgetCard>
        </div>
      </DashboardGrid>
    </div>
  ),
};

export const StaticLayout: Story = {
  args: {
    layout: simpleLayout,
    isDraggable: false,
    isResizable: false,
    children: null,
  },
  render: () => (
    <div style={{ padding: 16 }}>
      <DashboardGrid layout={simpleLayout} isDraggable={false} isResizable={false}>
        <div key="revenue">
          <WidgetCard title="Revenue">
            <div className="flex items-center justify-center h-full">$45,231</div>
          </WidgetCard>
        </div>
        <div key="users">
          <WidgetCard title="Users">
            <div className="flex items-center justify-center h-full">2,350</div>
          </WidgetCard>
        </div>
        <div key="orders">
          <WidgetCard title="Orders">
            <div className="flex items-center justify-center h-full">128</div>
          </WidgetCard>
        </div>
      </DashboardGrid>
    </div>
  ),
};
