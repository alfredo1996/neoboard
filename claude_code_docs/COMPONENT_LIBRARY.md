# Component Library

React component library for dashboard applications, built on shadcn/ui with ECharts visualizations.

## MCP Tools

| MCP | Use |
|-----|-----|
| **shadcn** | Add shadcn components (never use CLI) |
| **Context7** | Fetch docs for ECharts, react-grid-layout, Storybook |
| **filesystem** | Read/write/search files |
| **git** | Commit after each component |

## Stack

- React 18 + TypeScript
- shadcn/ui + Tailwind CSS
- Storybook 8
- Vitest + React Testing Library
- Apache ECharts
- react-grid-layout

## Monorepo Structure

This is a monorepo with separate packages:

```
/public
├── /src/                    # Main dashboard application
├── /connection/             # Connection module (Neo4j, PostgreSQL adapters)
└── /component/              # Component library package
    ├── package.json
    └── src/
        ├── components/
        │   ├── ui/                  # shadcn base components
        │   └── composed/            # custom components
        │       └── ComponentName/
        │           ├── ComponentName.tsx
        │           ├── ComponentName.stories.tsx
        │           ├── ComponentName.test.tsx
        │           └── index.ts
        ├── charts/
        │   ├── core/
        │   │   ├── BaseChart.tsx
        │   │   ├── useChart.ts
        │   │   └── themes/
        │   ├── TableChart/
        │   ├── BarChart/
        │   ├── LineChart/
        │   └── GraphChart/
        ├── hooks/
        │   ├── useContainerSize.ts
        │   └── useWidgetSize.ts
        └── lib/
            └── utils.ts
```

## Data Format

Charts receive `neodashRecords` from the connection module:

```tsx
type NeodashRecord = Record<string, unknown>;

interface BaseChartProps {
  records: NeodashRecord[];
  width?: number;
  height?: number;
  theme?: 'light' | 'dark';
  loading?: boolean;
  options?: EChartsOption;
  onClick?: (params: ECElementEvent) => void;
}
```

## Components Checklist

### Phase 1-5: shadcn Base (use MCP)

- [ ] Button, Input, Label, Card, Badge, Avatar, Separator, Skeleton
- [ ] Form, Select, Checkbox, Radio Group, Switch, Textarea, Slider
- [ ] Dialog, Alert Dialog, Dropdown Menu, Popover, Tooltip, Toast, Alert
- [ ] Tabs, Accordion, Navigation Menu, Breadcrumb, Pagination, Sheet
- [ ] Table, Calendar, Date Picker, Command, Combobox

### Phase 6: Core Composed

- [ ] SearchInput — input + search icon + clear button
- [ ] PasswordInput — input + show/hide toggle
- [ ] FormField — label + input + error
- [ ] ConfirmDialog — pre-configured alert dialog
- [ ] EmptyState — illustration + title + description + action
- [ ] PageHeader — title + breadcrumb + actions
- [ ] LoadingButton — button + spinner
- [ ] AvatarGroup — stacked avatars + overflow

### Phase 7: Widget Cards

- [ ] WidgetCard — draggable, resizable card container
- [ ] WidgetCardHeader — drag handle + title + actions menu
- [ ] WidgetCardBody — responsive container (ResizeObserver + context)
- [ ] WidgetCardFooter — optional footer
- [ ] StatCard — KPI with value + trend + sparkline
- [ ] MetricTile — compact metric
- [ ] ChartSkeleton — loading state for charts
- [ ] NoDataState — empty chart state
- [ ] ErrorState — error + retry button

### Phase 8: Dashboard Layout

- [ ] DashboardGrid — react-grid-layout wrapper (drag, resize, breakpoints)
- [ ] GridItem — connects WidgetCard to grid
- [ ] Sidebar — collapsible nav
- [ ] SidebarItem — nav item with icon + badge
- [ ] Toolbar — filter/action bar

### Phase 9: Filters

- [ ] FilterBar — horizontal filter container
- [ ] FilterChip — removable active filter
- [ ] FilterDropdown — field + operator + value
- [ ] DateRangePicker — dual calendar + presets
- [ ] RefreshControl — auto-refresh toggle
- [ ] QueryEditor — Monaco editor for queries

### Phase 10: Data Connection

- [ ] ConnectionCard — db connection + status
- [ ] ConnectionForm — credentials form
- [ ] ConnectionStatus — connected/error badge
- [ ] DataSourcePicker — source selector

### Phase 11: Data Grid

- [ ] DataGrid — sorting, filtering, pagination, resize
- [ ] ColumnHeader — sort + filter + resize
- [ ] CellRenderer — smart formatting
- [ ] RowActions — hover actions
- [ ] BulkActions — selected rows toolbar
- [ ] PaginationBar — page nav + size
- [ ] ExportButton — CSV/Excel/JSON

### Phase 12: Chart Config

- [ ] ChartTypePicker — visual chart selector
- [ ] AxisConfigurator — X/Y field dropzones
- [ ] FieldPicker — draggable field list
- [ ] ColorPicker — palette + custom


### Phase 13: Utility

- [ ] LoadingOverlay — full overlay spinner
- [ ] StatusDot — colored status indicator
- [ ] TruncatedText — ellipsis + tooltip
- [ ] CopyButton — copy + confirmation
- [ ] CodeBlock — syntax highlight + copy
- [ ] JsonViewer — collapsible JSON tree
- [ ] KeyValueList — key-value pairs
- [ ] TimeAgo — relative time + tooltip

## Charts Checklist

### Core

- [ ] BaseChart — ECharts wrapper + lifecycle
- [ ] useChart — instance management
- [ ] useChartResize — ResizeObserver hook
- [ ] themes/light.ts, themes/dark.ts

### Chart Types

- [ ] TableChart — `records`, `columns`, `sortable`, `pageSize`
- [ ] BarChart — `records`, `xField`, `yField`, `orientation`, `stacked`
- [ ] LineChart — `records`, `xField`, `yField`, `smooth`, `area`
- [ ] GraphChart — `records`, `nodeField`, `edgeSourceField`, `edgeTargetField`, `layout`

## Responsive Widget Pattern

```tsx
// WidgetCardBody passes size via context
const [ref, size] = useContainerSize();
<WidgetSizeProvider value={size}>
  {children}
</WidgetSizeProvider>

// Charts consume size
const { width, height } = useWidgetSize();
<ReactECharts style={{ width, height }} />
```

## Commands

```bash
npm run dev          # Vite dev
npm run storybook    # Storybook :6006
npm run test         # Vitest
npm run build        # Library build
```

## Commit Format

```
feat(ComponentName): add component with stories and tests
```


Please check the connection library for meaningful info about data format.
Please build the code SLIM, i don't want any spaghetti code or bloats.
