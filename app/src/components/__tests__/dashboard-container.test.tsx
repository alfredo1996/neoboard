// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import React from "react";

// dashboard-container.tsx does not import React explicitly (Next.js new JSX transform),
// so we make it available on globalThis before the module is loaded.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
(globalThis as any).React = React;

// ---------------------------------------------------------------------------
// Mocks — declared before importing the component under test
// ---------------------------------------------------------------------------

vi.mock("@/stores/parameter-store", () => ({
  useParameterStore: (selector: (s: { parameters: Record<string, unknown>; clearParameter: () => void; clearAll: () => void }) => unknown) =>
    selector({ parameters: {}, clearParameter: vi.fn(), clearAll: vi.fn() }),
}));

vi.mock("@/lib/chart-registry", () => ({
  getChartConfig: (type: string) =>
    type === "bar" ? { label: "Bar Chart" } : undefined,
}));

// Mock using the alias path that matches the import in dashboard-container.tsx
vi.mock("@/components/card-container", () => ({
  CardContainer: ({ widget }: { widget: { id: string } }) =>
    React.createElement("div", { "data-testid": `card-${widget.id}` }, "card"),
}));

vi.mock("@neoboard/components", () => ({
  WidgetCard: ({
    title,
    actions,
    draggable,
    children,
    headerExtra,
  }: {
    title?: string;
    actions?: Array<{ label: string; onClick: () => void; destructive?: boolean; disabled?: boolean }>;
    draggable?: boolean;
    children: React.ReactNode;
    headerExtra?: React.ReactNode;
  }) =>
    React.createElement(
      "div",
      { "data-testid": "widget-card-inner" },
      title && React.createElement("span", { "data-testid": "widget-title" }, title),
      draggable && React.createElement("span", { "data-testid": "draggable" }, "draggable"),
      headerExtra,
      actions?.map((a, i) =>
        React.createElement(
          "button",
          {
            key: i,
            "data-testid": `action-${a.label.toLowerCase().replace(/\s+/g, "-")}`,
            onClick: a.disabled ? undefined : a.onClick,
            disabled: a.disabled,
          },
          a.label
        )
      ),
      children
    ),
  EmptyState: ({ title }: { title: string }) =>
    React.createElement("div", { "data-testid": "empty-state" }, title),
  DashboardGrid: ({
    children,
  }: {
    children: React.ReactNode;
    layout?: unknown;
    onLayoutChange?: unknown;
    isDraggable?: boolean;
    isResizable?: boolean;
  }) => React.createElement("div", { "data-testid": "dashboard-grid" }, children),
  Dialog: ({
    open,
    children,
  }: {
    open: boolean;
    onOpenChange?: unknown;
    children: React.ReactNode;
  }) => (open ? React.createElement("div", { "data-testid": "dialog" }, children) : null),
  DialogContent: ({ children }: { children: React.ReactNode }) =>
    React.createElement("div", null, children),
  Button: ({
    children,
    onClick,
  }: {
    children: React.ReactNode;
    onClick?: () => void;
  }) => React.createElement("button", { onClick }, children),
  ParameterBar: ({
    children,
    onReset,
  }: {
    children: React.ReactNode;
    onReset?: () => void;
  }) =>
    React.createElement(
      "div",
      { "data-testid": "parameter-bar" },
      React.createElement("button", { onClick: onReset }, "Reset"),
      children
    ),
  CrossFilterTag: ({
    source,
    field,
    value,
    onRemove,
  }: {
    source: string;
    field: string;
    value: string;
    onRemove?: () => void;
  }) =>
    React.createElement(
      "span",
      { "data-testid": "cross-filter-tag", onClick: onRemove },
      `${source}:${field}=${value}`
    ),
}));

vi.mock("lucide-react", () => ({
  LayoutDashboard: () => React.createElement("span", null, "icon"),
  Maximize2: () => React.createElement("span", null, "maximize"),
}));

// ---------------------------------------------------------------------------
// Component under test (imported after mocks are set up)
// ---------------------------------------------------------------------------

import { DashboardContainer } from "../dashboard-container";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const makeWidget = (id: string, chartType = "bar", title?: string) => ({
  id,
  chartType,
  connectionId: "conn-1",
  query: "MATCH (n) RETURN n",
  settings: title ? { title } : undefined,
});

const makeGrid = (id: string) => ({ i: id, x: 0, y: 0, w: 4, h: 3 });

const pageWithWidgets = {
  id: "page-1",
  title: "Page 1",
  widgets: [makeWidget("w1", "bar", "Sales"), makeWidget("w2", "line")],
  gridLayout: [makeGrid("w1"), makeGrid("w2")],
};

const emptyPage = {
  id: "page-empty",
  title: "Empty",
  widgets: [],
  gridLayout: [],
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("DashboardContainer", () => {
  beforeEach(() => vi.clearAllMocks());
  afterEach(cleanup);

  // ── Empty state ──────────────────────────────────────────────────────────

  it("renders empty state when the page has no widgets", () => {
    render(<DashboardContainer page={emptyPage} />);
    expect(screen.getByTestId("empty-state")).toBeTruthy();
  });

  it("does not render the grid when the page has no widgets", () => {
    render(<DashboardContainer page={emptyPage} />);
    expect(screen.queryByTestId("dashboard-grid")).toBeNull();
  });

  // ── Widget rendering ─────────────────────────────────────────────────────

  it("renders a WidgetCard for each widget on the page", () => {
    render(<DashboardContainer page={pageWithWidgets} />);
    expect(screen.getAllByTestId("widget-card")).toHaveLength(2);
  });

  it("uses settings.title as the widget card title when available", () => {
    render(<DashboardContainer page={pageWithWidgets} />);
    expect(screen.getByText("Sales")).toBeTruthy();
  });

  it("falls back to chartType string when registry has no config for the type", () => {
    const page = {
      ...pageWithWidgets,
      widgets: [makeWidget("w3", "unknown-type")],
      gridLayout: [makeGrid("w3")],
    };
    render(<DashboardContainer page={page} />);
    expect(screen.getByText("unknown-type")).toBeTruthy();
  });

  it("uses chart registry label when widget has no title setting and registry returns label", () => {
    // "bar" maps to "Bar Chart" in our mock
    const page = {
      ...pageWithWidgets,
      widgets: [makeWidget("w4", "bar")],
      gridLayout: [makeGrid("w4")],
    };
    render(<DashboardContainer page={page} />);
    expect(screen.getByText("Bar Chart")).toBeTruthy();
  });

  // ── editable=false (default) — no actions ───────────────────────────────

  it("does not pass actions to WidgetCard when editable is false", () => {
    const onEdit = vi.fn();
    const onRemove = vi.fn();
    const onDuplicate = vi.fn();
    render(
      <DashboardContainer
        page={pageWithWidgets}
        onEditWidget={onEdit}
        onRemoveWidget={onRemove}
        onDuplicateWidget={onDuplicate}
      />
    );
    // No action buttons should be rendered when editable=false
    expect(screen.queryByTestId("action-edit")).toBeNull();
    expect(screen.queryByTestId("action-remove")).toBeNull();
    expect(screen.queryByTestId("action-duplicate")).toBeNull();
  });

  // ── editable=true — action wiring ────────────────────────────────────────

  it("renders Edit action when editable and onEditWidget is provided", () => {
    render(
      <DashboardContainer
        page={pageWithWidgets}
        editable
        onEditWidget={vi.fn()}
      />
    );
    expect(screen.getAllByTestId("action-edit")).toHaveLength(2);
  });

  it("calls onEditWidget with the correct widget when Edit is clicked", () => {
    const onEdit = vi.fn();
    render(
      <DashboardContainer
        page={pageWithWidgets}
        editable
        onEditWidget={onEdit}
      />
    );
    fireEvent.click(screen.getAllByTestId("action-edit")[0]);
    expect(onEdit).toHaveBeenCalledWith(pageWithWidgets.widgets[0]);
  });

  it("renders Duplicate action when editable and onDuplicateWidget is provided", () => {
    render(
      <DashboardContainer
        page={pageWithWidgets}
        editable
        onDuplicateWidget={vi.fn()}
      />
    );
    expect(screen.getAllByTestId("action-duplicate")).toHaveLength(2);
  });

  it("calls onDuplicateWidget with the widget id when Duplicate is clicked", () => {
    const onDuplicate = vi.fn();
    render(
      <DashboardContainer
        page={pageWithWidgets}
        editable
        onDuplicateWidget={onDuplicate}
      />
    );
    fireEvent.click(screen.getAllByTestId("action-duplicate")[0]);
    expect(onDuplicate).toHaveBeenCalledWith("w1");
  });

  it("renders Remove action when editable and onRemoveWidget is provided", () => {
    render(
      <DashboardContainer
        page={pageWithWidgets}
        editable
        onRemoveWidget={vi.fn()}
      />
    );
    expect(screen.getAllByTestId("action-remove")).toHaveLength(2);
  });

  it("calls onRemoveWidget with the widget id when Remove is clicked", () => {
    const onRemove = vi.fn();
    render(
      <DashboardContainer
        page={pageWithWidgets}
        editable
        onRemoveWidget={onRemove}
      />
    );
    fireEvent.click(screen.getAllByTestId("action-remove")[0]);
    expect(onRemove).toHaveBeenCalledWith("w1");
  });

  it("renders Save to Widget Lab action as disabled when editable", () => {
    render(
      <DashboardContainer
        page={pageWithWidgets}
        editable
      />
    );
    const saveToLabButtons = screen.getAllByTestId("action-save-to-widget-lab");
    expect(saveToLabButtons[0]).toBeTruthy();
    expect((saveToLabButtons[0] as HTMLButtonElement).disabled).toBe(true);
  });

  it("renders all four actions when editable and all callbacks are provided", () => {
    render(
      <DashboardContainer
        page={pageWithWidgets}
        editable
        onEditWidget={vi.fn()}
        onDuplicateWidget={vi.fn()}
        onRemoveWidget={vi.fn()}
      />
    );
    // Per widget: Edit, Duplicate, Save to Widget Lab, Remove
    expect(screen.getAllByTestId("action-edit")).toHaveLength(2);
    expect(screen.getAllByTestId("action-duplicate")).toHaveLength(2);
    expect(screen.getAllByTestId("action-save-to-widget-lab")).toHaveLength(2);
    expect(screen.getAllByTestId("action-remove")).toHaveLength(2);
  });

  it("does not render Edit action when onEditWidget is not provided", () => {
    render(
      <DashboardContainer
        page={pageWithWidgets}
        editable
        onRemoveWidget={vi.fn()}
      />
    );
    expect(screen.queryByTestId("action-edit")).toBeNull();
  });

  it("does not render Duplicate action when onDuplicateWidget is not provided", () => {
    render(
      <DashboardContainer
        page={pageWithWidgets}
        editable
        onEditWidget={vi.fn()}
      />
    );
    expect(screen.queryByTestId("action-duplicate")).toBeNull();
  });

  it("does not render Remove action when onRemoveWidget is not provided", () => {
    render(
      <DashboardContainer
        page={pageWithWidgets}
        editable
        onEditWidget={vi.fn()}
      />
    );
    expect(screen.queryByTestId("action-remove")).toBeNull();
  });
});
