# NeoBoard - Task List

> This file contains all tasks for the NeoBoard project. Each task has a unique ID, dependencies, and acceptance criteria.
> Use task IDs (T001, T002, etc.) when referencing tasks in commits and PRs.

---

## Status

**Current Phase**: Component Library Build (Phase 6: Core Composed)
**Current Branch**: `main`
**Last Updated**: 2026-02-05

### Completed ✅
- T001: Project initialization
- T002: Tailwind + shadcn setup
- T003: Zustand stores skeleton
- T004: IDataSource interface
- T005: Neo4j adapter
- T009: Connection provider
- T013: Schema introspection
- Connection Module Tests: All passing (Neo4j, PostgreSQL, parsers)
- CP001: shadcn Base Components Part 1 (Button, Input, Label, Card, Badge, Avatar, Separator, Skeleton)
- CP002: shadcn Form Components (Form, Select, Checkbox, Radio Group, Switch, Textarea, Slider)
- CP003: shadcn Dialog & Feedback Components (Dialog, Alert Dialog, Dropdown Menu, Popover, Tooltip, Toast, Alert)
- CP004: shadcn Layout & Navigation Components (Tabs, Accordion, Navigation Menu, Breadcrumb, Pagination, Sheet)
- CP005: shadcn Data & Picker Components (Table, Calendar, Command)
- Storybook: 31 story files covering all Phase 1-5 components, matching shadcn docs

### In Progress 🔄
- Phase 6: Core Composed Components

### Next Steps 📋
1. Build composed components (Phase 6)
2. Implement widget cards (Phase 7)
3. Create dashboard layout (Phase 8)
4. Build filters (Phase 9)

---

## Component Library Build (Phases 1-13)

This section maps the Component Library checklist to actionable tasks with dependencies and acceptance criteria.

### Phase 1-5: shadcn Base Components (8h)

#### CP001 - Add shadcn Base Components Part 1
- **Status**: COMPLETED ✅
- **Hours**: 2
- **Priority**: P0
- **Dependencies**: T002
- **Description**: Use shadcn MCP to add Button, Input, Label, Card, Badge, Avatar, Separator, Skeleton
- **Acceptance Criteria**:
  - [ ] All 8 components added to `src/components/ui/`
  - [ ] Components render correctly in Storybook
  - [ ] Tailwind styling applied

#### CP002 - Add shadcn Form Components
- **Status**: COMPLETED ✅
- **Hours**: 2
- **Priority**: P0
- **Dependencies**: T002
- **Description**: Add Form, Select, Checkbox, Radio Group, Switch, Textarea, Slider
- **Acceptance Criteria**:
  - [ ] All 7 form components available
  - [ ] react-hook-form integration working
  - [ ] Form validation examples in Storybook

#### CP003 - Add shadcn Dialog & Feedback Components
- **Status**: COMPLETED ✅
- **Hours**: 2
- **Priority**: P0
- **Dependencies**: T002
- **Description**: Add Dialog, Alert Dialog, Dropdown Menu, Popover, Tooltip, Toast, Alert
- **Acceptance Criteria**:
  - [ ] All 7 components added
  - [ ] Toast notifications functional
  - [ ] Dialog animations working

#### CP004 - Add shadcn Layout & Navigation Components
- **Status**: COMPLETED ✅
- **Hours**: 2
- **Priority**: P0
- **Dependencies**: T002
- **Description**: Add Tabs, Accordion, Navigation Menu, Breadcrumb, Pagination, Sheet
- **Acceptance Criteria**:
  - [ ] All 6 components added
  - [ ] Navigation patterns tested
  - [ ] Pagination functional

#### CP005 - Add shadcn Data & Picker Components
- **Status**: COMPLETED ✅
- **Hours**: 2
- **Priority**: P0
- **Dependencies**: T002
- **Description**: Add Table, Calendar, Date Picker, Command, Combobox
- **Acceptance Criteria**:
  - [ ] All 5 components added
  - [ ] Date picker functional
  - [ ] Table rendering correctly

---

### Phase 6: Core Composed Components (12h)

#### CP006 - Create SearchInput & PasswordInput
- **Status**: PENDING
- **Hours**: 2
- **Priority**: P0
- **Dependencies**: CP001, CP002
- **Description**: Build SearchInput (input + icon + clear) and PasswordInput (show/hide toggle) composed components
- **Acceptance Criteria**:
  - [ ] SearchInput clears on button click
  - [ ] PasswordInput toggles visibility
  - [ ] Both components in `src/components/composed/`
  - [ ] Storybook stories created

#### CP007 - Create FormField & ConfirmDialog
- **Status**: PENDING
- **Hours**: 2
- **Priority**: P0
- **Dependencies**: CP002, CP003
- **Description**: Build FormField (label + input + error) and ConfirmDialog (pre-configured alert dialog)
- **Acceptance Criteria**:
  - [ ] FormField displays errors correctly
  - [ ] ConfirmDialog confirm/cancel actions work
  - [ ] Both tested in Storybook

#### CP008 - Create EmptyState & PageHeader
- **Status**: PENDING
- **Hours**: 2
- **Priority**: P0
- **Dependencies**: CP001, CP004
- **Description**: Build EmptyState (illustration + title + description + action) and PageHeader (title + breadcrumb + actions)
- **Acceptance Criteria**:
  - [ ] EmptyState displays all elements
  - [ ] PageHeader layout responsive
  - [ ] Breadcrumb navigation working

#### CP009 - Create LoadingButton & AvatarGroup
- **Status**: PENDING
- **Hours**: 2
- **Priority**: P0
- **Dependencies**: CP001
- **Description**: Build LoadingButton (button + spinner) and AvatarGroup (stacked avatars + overflow)
- **Acceptance Criteria**:
  - [ ] LoadingButton shows spinner during loading
  - [ ] AvatarGroup stacks correctly
  - [ ] Overflow badge displays

#### CP010 - Create Utility Composed Components
- **Status**: PENDING
- **Hours**: 2
- **Priority**: P0
- **Dependencies**: CP001, CP003
- **Description**: Build TruncatedText (ellipsis + tooltip), CopyButton (copy + confirmation), StatusDot (colored indicator)
- **Acceptance Criteria**:
  - [ ] All 3 components functional
  - [ ] Copy button shows confirmation
  - [ ] Status indicators render correctly

#### CP011 - Create Code & Data Display Components
- **Status**: PENDING
- **Hours**: 2
- **Priority**: P0
- **Dependencies**: CP001
- **Description**: Build CodeBlock (syntax highlight + copy), JsonViewer (collapsible JSON tree), KeyValueList, TimeAgo (relative time + tooltip)
- **Acceptance Criteria**:
  - [ ] CodeBlock syntax highlighting works
  - [ ] JsonViewer collapses/expands
  - [ ] TimeAgo displays relative times

---

### Phase 7: Widget Cards (10h)

#### CP012 - Create WidgetCard Base Component
- **Status**: PENDING
- **Hours**: 3
- **Priority**: P0
- **Dependencies**: CP001
- **Description**: Build WidgetCard: draggable container, resizable edges, drag handle, title, action menu, loading/error states
- **Acceptance Criteria**:
  - [ ] Card renders with header
  - [ ] CSS for drag handle visible
  - [ ] Action menu available
  - [ ] Loading and error states display

#### CP013 - Create WidgetCard Body & Footer
- **Status**: PENDING
- **Hours**: 2
- **Priority**: P0
- **Dependencies**: CP012
- **Description**: Build WidgetCardBody (responsive container with ResizeObserver + context) and WidgetCardFooter
- **Acceptance Criteria**:
  - [ ] WidgetSizeProvider passes size via context
  - [ ] useWidgetSize hook works
  - [ ] Footer renders optionally

#### CP014 - Create StatCard & MetricTile
- **Status**: PENDING
- **Hours**: 2
- **Priority**: P0
- **Dependencies**: CP001
- **Description**: Build StatCard (KPI display with value + trend + sparkline) and MetricTile (compact metric)
- **Acceptance Criteria**:
  - [ ] StatCard displays trend indicator
  - [ ] Sparkline renders
  - [ ] MetricTile layout compact

#### CP015 - Create Chart Loading & Empty States
- **Status**: PENDING
- **Hours**: 2
- **Priority**: P0
- **Dependencies**: CP001
- **Description**: Build ChartSkeleton (loading animation), NoDataState (empty chart), ErrorState (error + retry button)
- **Acceptance Criteria**:
  - [ ] ChartSkeleton no layout shift
  - [ ] NoDataState displays helpful message
  - [ ] ErrorState retry button functional

#### CP016 - Create Responsive Size Hooks
- **Status**: PENDING
- **Hours**: 1
- **Priority**: P0
- **Dependencies**: CP013
- **Description**: Implement useContainerSize and useWidgetSize hooks for responsive widget sizing
- **Acceptance Criteria**:
  - [ ] useContainerSize returns ref and size
  - [ ] Size updates on window resize
  - [ ] Works with ResizeObserver

---

### Phase 8: Dashboard Layout (8h)

#### CP017 - Create DashboardGrid Component
- **Status**: PENDING
- **Hours**: 3
- **Priority**: P0
- **Dependencies**: CP012, T017
- **Description**: Build DashboardGrid: react-grid-layout wrapper with drag/resize, breakpoints (lg/md/sm), layout sync to store
- **Acceptance Criteria**:
  - [ ] Grid renders items
  - [ ] Items draggable
  - [ ] Items resizable
  - [ ] Layout syncs to dashboardStore

#### CP018 - Create GridItem Component
- **Status**: PENDING
- **Hours**: 2
- **Priority**: P0
- **Dependencies**: CP017, CP012
- **Description**: Build GridItem: connects WidgetCard to grid, handles size/position, manages resize state
- **Acceptance Criteria**:
  - [ ] GridItem renders card inside
  - [ ] Position/size sync correct
  - [ ] Responsive layout works

#### CP019 - Create Sidebar & SidebarItem Components
- **Status**: PENDING
- **Hours**: 2
- **Priority**: P0
- **Dependencies**: CP004
- **Description**: Build Sidebar (collapsible navigation) and SidebarItem (nav item with icon + badge)
- **Acceptance Criteria**:
  - [ ] Sidebar toggles open/closed
  - [ ] Items with icons display
  - [ ] Badge shows counts
  - [ ] Responsive on mobile

#### CP020 - Create Toolbar Component
- **Status**: PENDING
- **Hours**: 1
- **Priority**: P0
- **Dependencies**: CP001
- **Description**: Build Toolbar: filter/action bar for dashboard top
- **Acceptance Criteria**:
  - [ ] Toolbar renders
  - [ ] Actions/filters displayable
  - [ ] Responsive layout

---

### Phase 9: Filters (8h)

#### CP021 - Create FilterBar & FilterChip Components
- **Status**: PENDING
- **Hours**: 2
- **Priority**: P0
- **Dependencies**: CP001
- **Description**: Build FilterBar (horizontal filter container) and FilterChip (removable active filter)
- **Acceptance Criteria**:
  - [ ] FilterBar displays chips
  - [ ] Chips removable on click
  - [ ] Layout responsive

#### CP022 - Create FilterDropdown Component
- **Status**: PENDING
- **Hours**: 2
- **Priority**: P0
- **Dependencies**: CP002
- **Description**: Build FilterDropdown: field selector + operator + value input
- **Acceptance Criteria**:
  - [ ] Dropdown shows field options
  - [ ] Operator selector works
  - [ ] Value input functional

#### CP023 - Create DateRangePicker & RefreshControl
- **Status**: PENDING
- **Hours**: 2
- **Priority**: P0
- **Dependencies**: CP005
- **Description**: Build DateRangePicker (dual calendar + presets) and RefreshControl (auto-refresh toggle)
- **Acceptance Criteria**:
  - [ ] DateRangePicker selects date range
  - [ ] Presets available
  - [ ] RefreshControl toggle works

#### CP024 - Create QueryEditor Component
- **Status**: PENDING
- **Hours**: 2
- **Priority**: P0
- **Dependencies**: T007, T008
- **Description**: Build QueryEditor: Monaco editor for Cypher with syntax highlighting and run button
- **Acceptance Criteria**:
  - [ ] Editor renders
  - [ ] Syntax highlighting active
  - [ ] Run button executes query

---

### Phase 10: Data Connection (6h)

#### CP025 - Create ConnectionCard & ConnectionStatus Components
- **Status**: PENDING
- **Hours**: 2
- **Priority**: P0
- **Dependencies**: CP001, T005
- **Description**: Build ConnectionCard (db connection + status) and ConnectionStatus (connected/error badge)
- **Acceptance Criteria**:
  - [ ] Card displays connection info
  - [ ] Status badge shows connection state
  - [ ] Connect/disconnect buttons work

#### CP026 - Create ConnectionForm Component
- **Status**: PENDING
- **Hours**: 2
- **Priority**: P0
- **Dependencies**: CP006, CP007, T005
- **Description**: Build ConnectionForm: credentials form with validation, test connection button, password input
- **Acceptance Criteria**:
  - [ ] Form has all required fields
  - [ ] Validation works
  - [ ] Test button shows result
  - [ ] Submit saves connection

#### CP027 - Create DataSourcePicker Component
- **Status**: PENDING
- **Hours**: 2
- **Priority**: P0
- **Dependencies**: CP002
- **Description**: Build DataSourcePicker: source selector dropdown with connection list
- **Acceptance Criteria**:
  - [ ] Dropdown shows available sources
  - [ ] Selection updates context
  - [ ] Multiple sources selectable

---

### Phase 11: Data Grid (10h)

#### CP028 - Create DataGrid Component
- **Status**: PENDING
- **Hours**: 4
- **Priority**: P0
- **Dependencies**: CP005
- **Description**: Build DataGrid: sorting, filtering, pagination, resizable columns (ag-grid or custom)
- **Acceptance Criteria**:
  - [ ] DataGrid renders data
  - [ ] Column sorting works
  - [ ] Filtering functional
  - [ ] Pagination controls present
  - [ ] Columns resizable

#### CP029 - Create DataGrid Column & Row Features
- **Status**: PENDING
- **Hours**: 3
- **Priority**: P0
- **Dependencies**: CP028
- **Description**: Build ColumnHeader (sort + filter + resize), CellRenderer (smart formatting), RowActions (hover actions), BulkActions
- **Acceptance Criteria**:
  - [ ] Column headers interactive
  - [ ] Cell formatting works
  - [ ] Row actions appear on hover
  - [ ] Bulk actions toolbar displays

#### CP030 - Create DataGrid Toolbar & Export
- **Status**: PENDING
- **Hours**: 2
- **Priority**: P0
- **Dependencies**: CP028
- **Description**: Build PaginationBar (page nav + size control) and ExportButton (CSV/Excel/JSON export)
- **Acceptance Criteria**:
  - [ ] Pagination controls functional
  - [ ] CSV export downloads
  - [ ] Excel export works
  - [ ] JSON export available

#### CP031 - Create DataGrid Tests & Stories
- **Status**: PENDING
- **Hours**: 1
- **Priority**: P0
- **Dependencies**: CP028
- **Description**: Add comprehensive Storybook stories and Vitest tests for DataGrid components
- **Acceptance Criteria**:
  - [ ] Stories show all variants
  - [ ] Tests cover sort/filter/pagination
  - [ ] Accessibility tested

---

### Phase 12: Chart Config (6h)

#### CP032 - Create ChartTypePicker Component
- **Status**: PENDING
- **Hours**: 2
- **Priority**: P0
- **Dependencies**: CP001
- **Description**: Build ChartTypePicker: visual chart selector with icons for BarChart, LineChart, PieChart, TableChart, etc.
- **Acceptance Criteria**:
  - [ ] Grid of chart type icons
  - [ ] Selection shows preview
  - [ ] Current type highlighted
  - [ ] All chart types available

#### CP033 - Create AxisConfigurator & FieldPicker
- **Status**: PENDING
- **Hours**: 2
- **Priority**: P0
- **Dependencies**: CP002
- **Description**: Build AxisConfigurator (X/Y field dropzones) and FieldPicker (draggable field list)
- **Acceptance Criteria**:
  - [ ] Dropzones accept fields
  - [ ] Drag-and-drop works
  - [ ] Field list shows available fields
  - [ ] Config updates on change

#### CP034 - Create ColorPicker Component
- **Status**: PENDING
- **Hours**: 2
- **Priority**: P0
- **Dependencies**: CP001
- **Description**: Build ColorPicker: palette selector + custom color input
- **Acceptance Criteria**:
  - [ ] Palette colors selectable
  - [ ] Custom color picker works
  - [ ] Color applied to preview
  - [ ] Hex/RGB input supported

---

### Phase 13: Utility Components (6h)

#### CP035 - Create LoadingOverlay Component
- **Status**: PENDING
- **Hours**: 1
- **Priority**: P0
- **Dependencies**: CP001
- **Description**: Build LoadingOverlay: full-screen overlay with centered spinner
- **Acceptance Criteria**:
  - [ ] Overlay renders fullscreen
  - [ ] Spinner centered
  - [ ] Semi-transparent background

#### CP036 - Create StatusDot & TruncatedText Utils
- **Status**: PENDING
- **Hours**: 1
- **Priority**: P0
- **Dependencies**: CP001, CP003
- **Description**: Build StatusDot (colored status indicator) and TruncatedText (ellipsis + tooltip)
- **Acceptance Criteria**:
  - [ ] StatusDot renders with color
  - [ ] TruncatedText shows full text in tooltip
  - [ ] Both styled correctly

#### CP037 - Create CopyButton & CodeBlock Utils
- **Status**: PENDING
- **Hours**: 1
- **Priority**: P0
- **Dependencies**: CP001, CP003
- **Description**: Build CopyButton (copy + confirmation) and CodeBlock (syntax highlight + copy)
- **Acceptance Criteria**:
  - [ ] Copy button confirms copy
  - [ ] CodeBlock highlights syntax
  - [ ] Both copy to clipboard

#### CP038 - Create JsonViewer & KeyValueList Utils
- **Status**: PENDING
- **Hours**: 1
- **Priority**: P0
- **Dependencies**: CP001
- **Description**: Build JsonViewer (collapsible JSON tree) and KeyValueList (key-value pairs display)
- **Acceptance Criteria**:
  - [ ] JsonViewer collapses/expands
  - [ ] KeyValueList renders pairs
  - [ ] Both support deep nesting

#### CP039 - Create TimeAgo Component
- **Status**: PENDING
- **Hours**: 1
- **Priority**: P0
- **Dependencies**: CP001, CP003
- **Description**: Build TimeAgo: relative time display with tooltip
- **Acceptance Criteria**:
  - [ ] Shows relative time (e.g., "2 hours ago")
  - [ ] Tooltip shows absolute time
  - [ ] Updates periodically

---

### Charts Core & Types (12h)

#### CP040 - Create BaseChart & Chart Hooks
- **Status**: PENDING
- **Hours**: 3
- **Priority**: P0
- **Dependencies**: T024
- **Description**: Build BaseChart wrapper, useChart hook for instance management, useChartResize hook, light/dark themes
- **Acceptance Criteria**:
  - [ ] BaseChart wraps ECharts instance
  - [ ] useChart manages lifecycle
  - [ ] useChartResize auto-resizes
  - [ ] Both themes functional

#### CP041 - Create TableChart Component
- **Status**: PENDING
- **Hours**: 2
- **Priority**: P0
- **Dependencies**: CP028, T024
- **Description**: Build TableChart: renders records as table, configurable columns, sorting, pageSize
- **Acceptance Criteria**:
  - [ ] Renders neodashRecords correctly
  - [ ] Columns auto-configured
  - [ ] Sorting works
  - [ ] Pagination configurable

#### CP042 - Create BarChart Component
- **Status**: PENDING
- **Hours**: 2
- **Priority**: P0
- **Dependencies**: CP040, T025
- **Description**: Build BarChart: bar visualization, orientation (h/v), stacked option, custom options override
- **Acceptance Criteria**:
  - [ ] Renders bar chart from records
  - [ ] X/Y field configuration works
  - [ ] Stacking option functional
  - [ ] Colors customizable

#### CP043 - Create LineChart Component
- **Status**: PENDING
- **Hours**: 2
- **Priority**: P0
- **Dependencies**: CP040, T026
- **Description**: Build LineChart: line visualization, time series support, area fill, smooth curves
- **Acceptance Criteria**:
  - [ ] Renders line chart
  - [ ] Multiple series supported
  - [ ] Area fill option works
  - [ ] Date formatting correct

#### CP044 - Create GraphChart Component
- **Status**: PENDING
- **Hours**: 2
- **Priority**: P0
- **Dependencies**: CP040, T029
- **Description**: Build GraphChart: graph visualization, node/edge styling, nodeField, edgeSourceField, edgeTargetField
- **Acceptance Criteria**:
  - [ ] Graph renders from records
  - [ ] Nodes display
  - [ ] Edges display
  - [ ] Styling rules apply

#### CP045 - Create Chart Tests & Stories
- **Status**: PENDING
- **Hours**: 1
- **Priority**: P0
- **Dependencies**: CP041, CP042, CP043, CP044
- **Description**: Add comprehensive Storybook stories and Vitest tests for all chart components
- **Acceptance Criteria**:
  - [ ] Stories show all variants
  - [ ] Mock data provided
  - [ ] Tests cover rendering and config
  - [ ] Accessibility tested

---

## Connection Module Testing ✅

### CT001 - Neo4j Connection Tests ✅
- **Status**: COMPLETED
- **Description**: Implement comprehensive Neo4j connection test suite covering authentication, query execution, result parsing, transaction modes
- **Tests Passing**:
  - Check connection
  - Query basic operations
  - Query write operations
  - Parser tests (records, primitives, temporal data)
  - All 5 tests passing without timeouts

### CT002 - PostgreSQL Adapter Tests ✅
- **Status**: COMPLETED
- **Description**: Implement PostgreSQL connection tests with similar coverage to Neo4j
- **Tests Implemented**:
  - Authentication tests
  - Query execution tests
  - Parser tests for different data types

---

## Week 1: Project Setup & Connection Base (16h) ✅

### T001 - Project initialization ✅
- **Module**: Setup
- **Hours**: 2
- **Priority**: P0
- **Dependencies**: -
- **Status**: COMPLETED
- **Description**: Create Vite project with React 18, TypeScript 5.7, configure tsconfig, vite.config
- **Acceptance Criteria**:
  - [x] `npm run dev` starts dev server
  - [x] TypeScript compiles without errors
  - [x] Project structure matches architecture spec

### T002 - Tailwind + shadcn setup ✅
- **Module**: Setup
- **Hours**: 2
- **Priority**: P0
- **Dependencies**: T001
- **Status**: COMPLETED
- **Description**: Install Tailwind CSS, PostCSS, configure tailwind.config.js, init shadcn/ui, add base components
- **Acceptance Criteria**:
  - [x] Tailwind classes apply correctly
  - [x] shadcn components render
  - [x] Dark mode class support configured

### T003 - Zustand stores skeleton ✅
- **Module**: Connection
- **Hours**: 3
- **Priority**: P0
- **Dependencies**: T001
- **Status**: COMPLETED
- **Description**: Create stores: connectionStore, dashboardStore, parameterStore with TypeScript types
- **Acceptance Criteria**:
  - [x] All stores created with TypeScript types
  - [x] Persist middleware configured for connectionStore
  - [x] Actions work correctly

### T004 - IDataSource interface ✅
- **Module**: Connection
- **Hours**: 2
- **Priority**: P0
- **Dependencies**: T003
- **Status**: COMPLETED
- **Description**: Define interfaces: IDataSource, ConnectionConfig, InternalResult, ColumnDef, GraphNode, GraphRelationship
- **Acceptance Criteria**:
  - [x] All interfaces exported from `src/generalized/interfaces.ts`
  - [x] Types are comprehensive and well-documented

### T005 - Neo4j adapter ✅
- **Module**: Connection
- **Hours**: 4
- **Priority**: P0
- **Dependencies**: T004
- **Status**: COMPLETED
- **Description**: Implement Neo4jDataSource with neo4j-driver, execute Cypher, parse to InternalResult format
- **Acceptance Criteria**:
  - [x] Can connect to Neo4j instance
  - [x] Can run `MATCH (n) RETURN n LIMIT 10`
  - [x] Results parsed to InternalResult format
  - [x] Graph data (nodes/rels) extracted correctly

### T006 - Connection modal UI
- **Module**: Connection
- **Hours**: 3
- **Priority**: P0
- **Dependencies**: T002, T005
- **Status**: PENDING (Next Priority)
- **Description**: Create ConnectionModal component: form for host, port, database, username, password, test connection button, save connection
- **Acceptance Criteria**:
  - [ ] Modal opens/closes correctly
  - [ ] Form validates required fields
  - [ ] Test connection shows success/error
  - [ ] Save persists to store

---

## Week 2: Connection Module Complete (16h)

### T007 - Monaco Editor integration
- **Module**: Connection
- **Hours**: 3
- **Priority**: P0
- **Dependencies**: T001
- **Description**: Install @monaco-editor/react, create lazy-loaded wrapper component, configure for Cypher language
- **Acceptance Criteria**:
  - [ ] Monaco editor renders
  - [ ] Lazy loaded (not in main bundle)
  - [ ] Basic syntax highlighting works

### T008 - Cypher Editor component
- **Module**: Connection
- **Hours**: 3
- **Priority**: P0
- **Dependencies**: T007
- **Description**: Create CypherEditor: Monaco instance, Cypher language config, basic autocomplete for keywords, run query button, query history
- **Acceptance Criteria**:
  - [ ] Editor accepts Cypher input
  - [ ] Ctrl+Enter runs query
  - [ ] Keywords highlighted
  - [ ] Query history accessible

### T009 - Connection provider ✅
- **Module**: Connection
- **Hours**: 2
- **Priority**: P0
- **Dependencies**: T005
- **Status**: COMPLETED
- **Description**: Create ConnectionProvider context: manages active connection, exposes execute function, handles connection lifecycle
- **Acceptance Criteria**:
  - [x] `useConnection()` hook works throughout app
  - [x] Active connection accessible
  - [x] Execute function available

### T010 - Connection persistence
- **Module**: Connection
- **Hours**: 2
- **Priority**: P0
- **Dependencies**: T003, T006
- **Description**: Implement localStorage persistence for connections using Zustand persist middleware, encrypt passwords with simple obfuscation
- **Acceptance Criteria**:
  - [ ] Connections persist on page reload
  - [ ] Passwords not stored in plaintext
  - [ ] Can clear stored connections

### T011 - useCypher hook
- **Module**: Core
- **Hours**: 3
- **Priority**: P0
- **Dependencies**: T009
- **Description**: Create useCypher hook using TanStack Query: execute query, loading state, error handling, caching, refetch
- **Acceptance Criteria**:
  - [ ] Hook returns `{data, isLoading, error, refetch}`
  - [ ] Queries are cached
  - [ ] Errors handled gracefully

### T012 - Error handling & toasts
- **Module**: Core
- **Hours**: 2
- **Priority**: P0
- **Dependencies**: T002
- **Description**: Setup Sonner for toasts, create error boundary component, standardize error display format
- **Acceptance Criteria**:
  - [ ] Toast notifications work
  - [ ] Error boundary catches errors
  - [ ] App doesn't crash on component error

### T013 - Schema introspection ✅
- **Module**: Connection
- **Hours**: 1
- **Priority**: P1
- **Dependencies**: T005
- **Status**: COMPLETED
- **Description**: Add getSchema to Neo4j adapter: call db.schema.visualization(), parse node labels, relationship types, properties
- **Acceptance Criteria**:
  - [x] Can retrieve database schema
  - [x] Node labels listed
  - [x] Relationship types listed

---

## Week 3: Core Dashboard Structure (16h)

### T014 - Dashboard store
- **Module**: Core
- **Hours**: 3
- **Priority**: P0
- **Dependencies**: T003
- **Description**: Implement full dashboardStore: CRUD operations, page management, card management, layout updates, undo/redo stack
- **Acceptance Criteria**:
  - [ ] All CRUD actions work
  - [ ] State updates correctly
  - [ ] Undo/redo functional (basic)

### T015 - Type definitions
- **Module**: Core
- **Hours**: 2
- **Priority**: P0
- **Dependencies**: T014
- **Description**: Define types: Dashboard, Page, Card, Layout, ChartConfig, ChartType enum, DashboardSettings
- **Acceptance Criteria**:
  - [ ] All types exported from `src/core/dashboard/types.ts`
  - [ ] Types used throughout codebase

### T016 - App shell layout
- **Module**: Core
- **Hours**: 4
- **Priority**: P0
- **Dependencies**: T002
- **Description**: Create Shell component: sidebar (collapsible), main area, right panel (conditional). Use CSS Grid or Flexbox
- **Acceptance Criteria**:
  - [ ] Layout renders correctly
  - [ ] Sidebar toggles open/closed
  - [ ] Responsive on different screen sizes

### T017 - react-grid-layout setup
- **Module**: Grid
- **Hours**: 4
- **Priority**: P0
- **Dependencies**: T016, T014
- **Description**: Install react-grid-layout, create GridLayout wrapper, configure breakpoints, handle layout changes, sync with store
- **Acceptance Criteria**:
  - [ ] Grid renders
  - [ ] Items draggable
  - [ ] Items resizable
  - [ ] Layout syncs to store

### T018 - Card wrapper component
- **Module**: Card
- **Hours**: 3
- **Priority**: P0
- **Dependencies**: T017
- **Description**: Create Card component: front (chart), back (settings), flip animation on settings click, loading state, error state, header with title and actions
- **Acceptance Criteria**:
  - [ ] Card renders with header
  - [ ] Flip animation works
  - [ ] Loading state displays
  - [ ] Error state displays

---

## Week 4: Chart System & Table (16h)

### T019 - IChart interface
- **Module**: Charts
- **Hours**: 2
- **Priority**: P0
- **Dependencies**: T015
- **Description**: Define IChart interface: type, name, icon, render(), getSettingsSchema(), getDefaultConfig(), transformData(), validateData()
- **Acceptance Criteria**:
  - [ ] Interface defined in `src/charts/types.ts`
  - [ ] All methods typed correctly

### T020 - Chart registry
- **Module**: Charts
- **Hours**: 2
- **Priority**: P0
- **Dependencies**: T019
- **Description**: Create chartRegistry: register chart types, get chart by type, list all charts, lazy load chart components
- **Acceptance Criteria**:
  - [ ] Registry pattern works
  - [ ] Charts registered dynamically
  - [ ] Lazy loading functional

### T021 - AG Grid TableChart
- **Module**: Table
- **Hours**: 5
- **Priority**: P0
- **Dependencies**: T020
- **Description**: Install ag-grid-community and ag-grid-react, create TableChart implementing IChart, configure columns from InternalResult, enable sorting/filtering
- **Acceptance Criteria**:
  - [ ] Table renders data
  - [ ] Columns auto-configured from query result
  - [ ] Sorting works
  - [ ] Filtering works

### T022 - Table settings
- **Module**: Table
- **Hours**: 3
- **Priority**: P0
- **Dependencies**: T021
- **Description**: Create TableSettings: column visibility, column order, pagination size, row height, export CSV button
- **Acceptance Criteria**:
  - [ ] Can hide/show columns
  - [ ] Pagination configurable
  - [ ] CSV export works

### T023 - Card settings panel
- **Module**: Card
- **Hours**: 4
- **Priority**: P0
- **Dependencies**: T018, T022
- **Description**: Create CardSettings: appears on card flip (compact) or in modal (expanded), tabs for Query/Settings/Style, save/cancel buttons
- **Acceptance Criteria**:
  - [ ] Settings panel works in flip mode
  - [ ] Settings panel works in modal mode
  - [ ] Tabs switch correctly
  - [ ] Save persists changes

---

## Week 5: ECharts Integration (16h)

### T024 - ECharts setup
- **Module**: Charts
- **Hours**: 3
- **Priority**: P0
- **Dependencies**: T020
- **Description**: Install echarts and echarts-for-react, create responsive wrapper component that auto-resizes, configure base theme
- **Acceptance Criteria**:
  - [ ] ECharts renders
  - [ ] Auto-resizes with container
  - [ ] Theme consistent with app

### T025 - BarChart implementation
- **Module**: Bar
- **Hours**: 4
- **Priority**: P0
- **Dependencies**: T024
- **Description**: Create BarChart implementing IChart: transform InternalResult to ECharts series, settings for orientation, stacked, colors
- **Acceptance Criteria**:
  - [ ] Bar chart renders from query results
  - [ ] Horizontal/vertical orientation works
  - [ ] Stacked option works

### T026 - LineChart implementation
- **Module**: Line
- **Hours**: 4
- **Priority**: P0
- **Dependencies**: T024
- **Description**: Create LineChart: time series support, multiple series, area fill option, smooth curves option
- **Acceptance Criteria**:
  - [ ] Line chart renders
  - [ ] Dates on X axis work
  - [ ] Multiple series supported
  - [ ] Area fill option works

### T027 - PieChart implementation
- **Module**: Pie
- **Hours**: 3
- **Priority**: P0
- **Dependencies**: T024
- **Description**: Create PieChart: donut option, legend, label formatting, color palette
- **Acceptance Criteria**:
  - [ ] Pie chart renders
  - [ ] Donut mode works
  - [ ] Labels show values

### T028 - SingleValue chart
- **Module**: KPI
- **Hours**: 2
- **Priority**: P1
- **Dependencies**: T020
- **Description**: Create SingleValue: large number display, trend indicator, subtitle, color thresholds, prefix/suffix
- **Acceptance Criteria**:
  - [ ] Displays single aggregated value
  - [ ] Prefix/suffix configurable
  - [ ] Color thresholds work

---

## Week 6: Graph Visualization (16h)

### T029 - NVL integration
- **Module**: Graph
- **Hours**: 5
- **Priority**: P0
- **Dependencies**: T020
- **Description**: Install @neo4j-nvl/react and interaction-handlers, create wrapper component, configure renderer
- **Acceptance Criteria**:
  - [ ] NVL renders basic graph
  - [ ] WebGL works
  - [ ] No console errors

### T030 - GraphChart component
- **Module**: Graph
- **Hours**: 4
- **Priority**: P0
- **Dependencies**: T029
- **Description**: Create GraphChart implementing IChart: parse graph data from InternalResult, render nodes and relationships
- **Acceptance Criteria**:
  - [ ] Graph renders from Cypher results
  - [ ] Nodes displayed
  - [ ] Relationships displayed

### T031 - Node styling rules
- **Module**: Graph
- **Hours**: 3
- **Priority**: P0
- **Dependencies**: T030
- **Description**: Implement node styling: color by label, size by property, icon by label, caption property selection
- **Acceptance Criteria**:
  - [ ] Nodes colored by label
  - [ ] Node size configurable
  - [ ] Caption property selectable

### T032 - Edge styling rules
- **Module**: Graph
- **Hours**: 2
- **Priority**: P0
- **Dependencies**: T030
- **Description**: Implement edge styling: color by type, width by property, caption property
- **Acceptance Criteria**:
  - [ ] Edges colored by type
  - [ ] Edge width configurable

### T033 - Click handlers
- **Module**: Graph
- **Hours**: 2
- **Priority**: P1
- **Dependencies**: T030
- **Description**: Add node click: expand neighbors, show properties panel. Add double-click: focus node. Add right-click: context menu
- **Acceptance Criteria**:
  - [ ] Click shows properties
  - [ ] Double-click focuses
  - [ ] Right-click shows menu

---

## Week 7: Parameter System (16h)

### T034 - Parameter store
- **Module**: Parameters
- **Hours**: 2
- **Priority**: P0
- **Dependencies**: T003
- **Description**: Implement parameterStore: get/set params, subscribe to changes, URL sync, default values
- **Acceptance Criteria**:
  - [ ] Parameters stored
  - [ ] Subscription works
  - [ ] Default values set

### T035 - ParameterInput components
- **Module**: Parameters
- **Hours**: 6
- **Priority**: P0
- **Dependencies**: T034
- **Description**: Create inputs: TextParameter, DropdownParameter (from query), DateParameter, DateRangeParameter, MultiSelectParameter, NumberParameter
- **Acceptance Criteria**:
  - [ ] All parameter types render
  - [ ] Values update store
  - [ ] Dropdown populates from query

### T036 - Query parameter substitution
- **Module**: Parameters
- **Hours**: 3
- **Priority**: P0
- **Dependencies**: T034, T011
- **Description**: Implement $param substitution in queries before execution, handle missing params, type coercion
- **Acceptance Criteria**:
  - [ ] `$paramName` replaced with value
  - [ ] Missing params handled gracefully
  - [ ] Types coerced correctly

### T037 - Parameter-chart linking
- **Module**: Parameters
- **Hours**: 3
- **Priority**: P0
- **Dependencies**: T036
- **Description**: Cards re-execute query when dependent parameters change, configurable per card
- **Acceptance Criteria**:
  - [ ] Charts refresh on param change
  - [ ] Can configure which params trigger refresh

### T038 - URL parameter sync
- **Module**: Parameters
- **Hours**: 2
- **Priority**: P1
- **Dependencies**: T034
- **Description**: Sync parameters to URL query string, restore on page load, shareable dashboard URLs
- **Acceptance Criteria**:
  - [ ] URL reflects current params
  - [ ] Params restore from URL on load
  - [ ] Shareable links work

---

## Week 8: Card Settings & Preview (16h)

### T039 - Settings modal expanded
- **Module**: Card
- **Hours**: 4
- **Priority**: P0
- **Dependencies**: T023
- **Description**: Create expanded settings modal: full query editor, all settings tabs, live preview panel, larger workspace
- **Acceptance Criteria**:
  - [ ] Modal opens large
  - [ ] Full editor available
  - [ ] All tabs present

### T040 - Live preview
- **Module**: Card
- **Hours**: 4
- **Priority**: P0
- **Dependencies**: T039
- **Description**: Add preview panel to settings: executes query on change (debounced), shows chart preview, error display
- **Acceptance Criteria**:
  - [ ] Preview updates as settings change
  - [ ] Debounced (not on every keystroke)
  - [ ] Errors displayed in preview

### T041 - Query validation
- **Module**: Card
- **Hours**: 2
- **Priority**: P0
- **Dependencies**: T008
- **Description**: Validate Cypher syntax before execution, show inline errors in editor, suggest fixes
- **Acceptance Criteria**:
  - [ ] Invalid syntax highlighted
  - [ ] Error messages shown
  - [ ] Validation before run

### T042 - Auto-refresh config
- **Module**: Card
- **Hours**: 2
- **Priority**: P0
- **Dependencies**: T023
- **Description**: Add refresh interval setting to cards: off/10s/30s/1m/5m, visual indicator when refreshing
- **Acceptance Criteria**:
  - [ ] Interval options available
  - [ ] Cards auto-refresh
  - [ ] Refresh indicator shown

### T043 - Card duplication
- **Module**: Card
- **Hours**: 2
- **Priority**: P1
- **Dependencies**: T018
- **Description**: Add duplicate action to card menu, copies card with new ID, places adjacent in grid
- **Acceptance Criteria**:
  - [ ] Duplicate option in menu
  - [ ] New card created with same settings
  - [ ] New card placed near original

### T044 - Keyboard shortcuts
- **Module**: Core
- **Hours**: 2
- **Priority**: P1
- **Dependencies**: T016
- **Description**: Implement shortcuts: Ctrl+S save, Ctrl+E edit mode, Escape close modal, Del delete selected card
- **Acceptance Criteria**:
  - [ ] Shortcuts functional
  - [ ] Help tooltip available

---

## Week 9: Persistence (16h)

### T045 - SQLite schema
- **Module**: Auth
- **Hours**: 2
- **Priority**: P0
- **Dependencies**: -
- **Description**: Design schema: dashboards (id, title, json, created, updated), connections (id, name, config_encrypted), users (optional)
- **Acceptance Criteria**:
  - [ ] Schema SQL file created
  - [ ] Tables well-designed

### T046 - sql.js integration
- **Module**: Auth
- **Hours**: 3
- **Priority**: P0
- **Dependencies**: T045
- **Description**: Install sql.js, create database service, init schema on first load, CRUD operations
- **Acceptance Criteria**:
  - [ ] SQLite works in browser
  - [ ] Schema initialized
  - [ ] CRUD operations work

### T047 - Dashboard CRUD
- **Module**: Dashboard
- **Hours**: 4
- **Priority**: P0
- **Dependencies**: T046, T014
- **Description**: Implement: createDashboard, loadDashboard, saveDashboard, deleteDashboard, listDashboards
- **Acceptance Criteria**:
  - [ ] All CRUD operations work
  - [ ] Dashboard JSON stored correctly
  - [ ] Timestamps updated

### T048 - Dashboard list UI
- **Module**: Dashboard
- **Hours**: 3
- **Priority**: P0
- **Dependencies**: T047
- **Description**: Create DashboardList page: shows all dashboards, search/filter, create new, delete with confirm, last modified date
- **Acceptance Criteria**:
  - [ ] List displays all dashboards
  - [ ] Search works
  - [ ] Delete confirms
  - [ ] Create opens new dashboard

### T049 - Export/Import JSON
- **Module**: Dashboard
- **Hours**: 2
- **Priority**: P0
- **Dependencies**: T047
- **Description**: Add export dashboard as JSON file, import JSON file, validate structure on import
- **Acceptance Criteria**:
  - [ ] Export downloads JSON file
  - [ ] Import loads dashboard
  - [ ] Invalid JSON rejected

### T050 - Save to Neo4j
- **Module**: Dashboard
- **Hours**: 2
- **Priority**: P1
- **Dependencies**: T047, T005
- **Description**: Alternative storage: save dashboard JSON as node in Neo4j, load from Neo4j, for NeoDash compatibility
- **Acceptance Criteria**:
  - [ ] Can save to Neo4j
  - [ ] Can load from Neo4j
  - [ ] Compatible with NeoDash format

---

## Week 10: Local Mode & Resources (16h)

### T051 - Local mode
- **Module**: Resources
- **Hours**: 3
- **Priority**: P0
- **Dependencies**: T010
- **Description**: Implement localStorage-only mode: no sql.js required, connections in localStorage, dashboards in localStorage, clear data option
- **Acceptance Criteria**:
  - [ ] App works without SQLite
  - [ ] Data persists in localStorage
  - [ ] Clear data option works

### T052 - Resource manager UI
- **Module**: Resources
- **Hours**: 4
- **Priority**: P0
- **Dependencies**: T006
- **Description**: Create ResourceManager: list connections, add/edit/delete, test connection, show status
- **Acceptance Criteria**:
  - [ ] Full connection management UI
  - [ ] Status indicators work
  - [ ] All actions functional

### T053 - Secret encryption
- **Module**: Resources
- **Hours**: 3
- **Priority**: P0
- **Dependencies**: T046
- **Description**: Encrypt sensitive fields (passwords) using Web Crypto API, store encrypted, decrypt on use
- **Acceptance Criteria**:
  - [ ] Passwords encrypted at rest
  - [ ] Decryption works for use
  - [ ] Encryption key managed securely

### T054 - Connection import/export
- **Module**: Resources
- **Hours**: 2
- **Priority**: P0
- **Dependencies**: T052
- **Description**: Export connections as JSON (without secrets or with encrypted), import connections
- **Acceptance Criteria**:
  - [ ] Can backup connections
  - [ ] Can restore connections
  - [ ] Secrets handled appropriately

### T055 - Multi-connection support
- **Module**: Resources
- **Hours**: 4
- **Priority**: P1
- **Dependencies**: T052, T023
- **Description**: Allow different cards to use different connections, connection selector per card
- **Acceptance Criteria**:
  - [ ] Card can select connection
  - [ ] Different cards use different DBs
  - [ ] Connection switching works

---

## Week 11: Polish (16h)

### T056 - Dark mode
- **Module**: UX
- **Hours**: 3
- **Priority**: P0
- **Dependencies**: T002
- **Description**: Implement dark theme: Tailwind dark classes, theme toggle in header, persist preference, chart theme sync
- **Acceptance Criteria**:
  - [ ] Dark mode works throughout app
  - [ ] Toggle in header
  - [ ] Preference persisted
  - [ ] Charts themed correctly

### T057 - Responsive layout
- **Module**: UX
- **Hours**: 3
- **Priority**: P0
- **Dependencies**: T016
- **Description**: Adjust layout for tablet/mobile: collapsible sidebar, stacked cards, touch-friendly controls
- **Acceptance Criteria**:
  - [ ] App usable on tablet
  - [ ] Sidebar collapses on mobile
  - [ ] Touch interactions work

### T058 - Loading states
- **Module**: UX
- **Hours**: 2
- **Priority**: P0
- **Dependencies**: T018
- **Description**: Add skeleton loaders for: dashboard load, card query, connection test. Consistent loading indicators
- **Acceptance Criteria**:
  - [ ] Skeleton loaders display
  - [ ] No layout shift on load
  - [ ] Consistent loading style

### T059 - Error boundaries
- **Module**: UX
- **Hours**: 2
- **Priority**: P0
- **Dependencies**: T012
- **Description**: Add React error boundaries: per card (card shows error, others work), app level (recovery option)
- **Acceptance Criteria**:
  - [ ] Card errors don't crash app
  - [ ] App-level fallback works
  - [ ] Recovery option available

### T060 - Onboarding tour
- **Module**: UX
- **Hours**: 3
- **Priority**: P1
- **Dependencies**: T016
- **Description**: Create first-time user tour: highlight key features, sample queries, skip option, don't show again
- **Acceptance Criteria**:
  - [ ] Tour guides new users
  - [ ] Can skip tour
  - [ ] Doesn't show again after completion

### T061 - Demo dashboard
- **Module**: Demo
- **Hours**: 3
- **Priority**: P1
- **Dependencies**: T047
- **Description**: Create demo with Neo4j Movies dataset: actor graph, movie table, genre pie chart, ratings line chart
- **Acceptance Criteria**:
  - [ ] Demo showcases all chart types
  - [ ] Works with Movies dataset
  - [ ] Can be loaded easily

---

## Week 12: Differentiators (16h)

### T062 - Natural Language Query
- **Module**: AI
- **Hours**: 8
- **Priority**: P1
- **Dependencies**: T008, T013
- **Description**: Integrate LLM API (OpenAI/Claude): NL input field, generate Cypher from description, show generated query, edit before run
- **Acceptance Criteria**:
  - [ ] NL input field available
  - [ ] Generates valid Cypher
  - [ ] Can edit before running
  - [ ] API key configurable

### T063 - Schema explorer
- **Module**: Core
- **Hours**: 4
- **Priority**: P1
- **Dependencies**: T013
- **Description**: Create schema panel: visual node labels, relationship types, property list, click to insert in query, search
- **Acceptance Criteria**:
  - [ ] Schema browsable
  - [ ] Click inserts into query
  - [ ] Search works

### T064 - Query templates
- **Module**: Core
- **Hours**: 2
- **Priority**: P2
- **Dependencies**: T008
- **Description**: Create template library: common queries (shortest path, aggregations, etc), insert with placeholders
- **Acceptance Criteria**:
  - [ ] Template library available
  - [ ] Templates insertable
  - [ ] Placeholders highlighted

### T065 - Export chart PNG
- **Module**: Export
- **Hours**: 2
- **Priority**: P2
- **Dependencies**: T018
- **Description**: Add export button per card: render chart to canvas, download as PNG, include title
- **Acceptance Criteria**:
  - [ ] Export button in card menu
  - [ ] PNG downloads
  - [ ] Title included in image

---

## Summary & Progress

### Component Library Phases

| Phase | Components | Hours | P0 Tasks | Status |
|-------|-----------|-------|----------|--------|
| CP001-CP005: shadcn Base | Button, Input, Form, Dialog, Table, etc. | 8 | 5 | ✅ COMPLETED |
| CP006-CP011: Core Composed | SearchInput, FormField, PageHeader, etc. | 12 | 6 | ⏳ PENDING |
| CP012-CP016: Widget Cards | WidgetCard, StatCard, Loading/Error States | 10 | 5 | ⏳ PENDING |
| CP017-CP020: Dashboard Layout | DashboardGrid, Sidebar, Toolbar | 8 | 4 | ⏳ PENDING |
| CP021-CP024: Filters | FilterBar, DateRangePicker, QueryEditor | 8 | 4 | ⏳ PENDING |
| CP025-CP027: Data Connection | ConnectionCard, ConnectionForm | 6 | 3 | ⏳ PENDING |
| CP028-CP031: Data Grid | DataGrid, ColumnHeader, Export | 10 | 4 | ⏳ PENDING |
| CP032-CP034: Chart Config | ChartTypePicker, AxisConfigurator | 6 | 3 | ⏳ PENDING |
| CP035-CP039: Utilities | LoadingOverlay, TimeAgo, JsonViewer | 6 | 5 | ⏳ PENDING |
| CP040-CP045: Charts Core & Types | BaseChart, BarChart, LineChart, GraphChart | 12 | 6 | ⏳ PENDING |
| **COMPONENT LIBRARY TOTAL** | **45 Components** | **86** | **45** | 📋 |

### Feature Development Timeline

| Phase | Weeks | Hours | P0 Tasks | Status |
|-------|-------|-------|----------|--------|
| Connection Module | Done | ~40 | 8 | ✅ COMPLETED |
| Foundation (UI/Charts) | 1-3 | 48 | 15 | ⏳ PENDING (T006+) |
| Charts & Reports | 4-6 | 48 | 14 | ⏳ PENDING |
| Interactivity | 7-8 | 32 | 10 | ⏳ PENDING |
| Persistence | 9-10 | 32 | 9 | ⏳ PENDING |
| Polish & Differentiators | 11-12 | 32 | 6 | ⏳ PENDING |

### Overall Project Progress

| Metric | Total | Completed | Remaining | % |
|--------|-------|-----------|-----------|---|
| Hours (Feature Tasks) | 192 | 40 | 152 | 21% |
| P0 Tasks (Feature) | 54 | 8 | 46 | 15% |
| Hours (Component Library) | 86 | 8 | 78 | 9% |
| P0 Tasks (Components) | 45 | 5 | 40 | 11% |
| **TOTAL HOURS** | **278** | **48** | **230** | **17%** |
| **TOTAL P0 TASKS** | **99** | **13** | **86** | **13%** |
