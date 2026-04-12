/**
 * DashboardContainer — double-click to edit widget.
 *
 * Tests the onDoubleClick handler added in the widget editor UX PR.
 * The handler should only fire when editable=true AND actions.onEditWidget
 * is provided.
 */
import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { DashboardPage, DashboardWidget } from "@/lib/db/schema";

// ── Mocks ──────────────────────────────────────────────────────────────

vi.mock("@neoboard/components", () => ({
  WidgetCard: ({
    children,
    title,
  }: {
    children: React.ReactNode;
    title: string;
  }) => (
    <div data-testid="widget-card-inner" data-title={title}>
      {children}
    </div>
  ),
  EmptyState: ({
    title,
    description,
  }: {
    title: string;
    description?: string;
  }) => (
    <div data-testid="empty-state">
      <span>{title}</span>
      {description && <span>{description}</span>}
    </div>
  ),
  DashboardGrid: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="dashboard-grid">{children}</div>
  ),
  Dialog: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  DialogContent: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  DialogTitle: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  Button: ({
    children,
    ...props
  }: React.PropsWithChildren<Record<string, unknown>>) => (
    <button {...props}>{children}</button>
  ),
  ParameterBar: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  CrossFilterTag: () => <div />,
  AlertDialog: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  AlertDialogAction: ({ children }: { children: React.ReactNode }) => (
    <button>{children}</button>
  ),
  AlertDialogCancel: ({ children }: { children: React.ReactNode }) => (
    <button>{children}</button>
  ),
  AlertDialogContent: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  AlertDialogDescription: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  AlertDialogFooter: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  AlertDialogHeader: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  AlertDialogTitle: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  buildCsvString: () => "",
  triggerDownload: vi.fn(),
  buildExportFilename: () => "export.csv",
}));

vi.mock("@/components/card-container", () => ({
  CardContainer: () => <div data-testid="card-container" />,
}));

vi.mock("@/lib/widget/interpolate-title", () => ({
  interpolateTitle: (title: string) => title,
}));

vi.mock("@/lib/widget/card-utils", () => ({
  buildExportData: () => [],
}));

vi.mock("@/lib/widget/widget-utils", () => ({
  getWidgetDisplayTitle: (w: DashboardWidget) =>
    (w.settings?.title as string) || w.chartType,
  isWidgetTemplateOutdated: () => false,
}));

vi.mock("@/lib/widget/widget-actions", () => ({
  isDataWidget: () => true,
}));

vi.mock("@/stores/parameter-store", () => ({
  useParameterStore: (sel: (s: Record<string, unknown>) => unknown) =>
    sel({
      parameters: {},
      clearParameter: vi.fn(),
      clearAll: vi.fn(),
    }),
  useParameterValues: () => ({}),
}));

vi.mock("@/lib/parameter/format-parameter-value", () => ({
  formatParameterValue: (v: unknown) => String(v),
  filterParentParams: (entries: [string, unknown][]) => entries,
}));

vi.mock("@/lib/query/resolve-cache-options", () => ({
  shouldShowRefreshButton: () => false,
}));

// Import the component after mocks
const { DashboardContainer } = await import("../dashboard-container");

// ── Helpers ────────────────────────────────────────────────────────────

function makeWidget(overrides: Partial<DashboardWidget> = {}): DashboardWidget {
  return {
    id: "w-1",
    chartType: "bar",
    connectionId: "conn-1",
    query: "MATCH (n) RETURN n",
    settings: { title: "Test Widget" },
    ...overrides,
  };
}

function makePage(widgets: DashboardWidget[] = [makeWidget()]): DashboardPage {
  return {
    id: "page-1",
    title: "Test Page",
    widgets,
    gridLayout: widgets.map((w, i) => ({
      i: w.id,
      x: 0,
      y: i * 2,
      w: 12,
      h: 2,
    })),
  };
}

function renderWithProviders(ui: React.ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>,
  );
}

describe("DashboardContainer — double-click to edit", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("calls onEditWidget with the widget when double-clicking in edit mode", async () => {
    const user = userEvent.setup();
    const onEditWidget = vi.fn();
    const widget = makeWidget();

    renderWithProviders(
      <DashboardContainer
        page={makePage([widget])}
        editable={true}
        actions={{ onEditWidget }}
      />,
    );

    const widgetDiv = screen.getByTestId("widget-card");
    await user.dblClick(widgetDiv);

    expect(onEditWidget).toHaveBeenCalledTimes(1);
    expect(onEditWidget).toHaveBeenCalledWith(widget);
  });

  it("does NOT call onEditWidget on double-click when editable is false", async () => {
    const user = userEvent.setup();
    const onEditWidget = vi.fn();

    renderWithProviders(
      <DashboardContainer
        page={makePage()}
        editable={false}
        actions={{ onEditWidget }}
      />,
    );

    const widgetDiv = screen.getByTestId("widget-card");
    await user.dblClick(widgetDiv);

    expect(onEditWidget).not.toHaveBeenCalled();
  });

  it("does NOT call onEditWidget on double-click when onEditWidget is not provided", async () => {
    const user = userEvent.setup();

    renderWithProviders(
      <DashboardContainer page={makePage()} editable={true} actions={{}} />,
    );

    const widgetDiv = screen.getByTestId("widget-card");
    // Should not throw — onDoubleClick is undefined so nothing happens
    await user.dblClick(widgetDiv);
    // No error means the handler was properly set to undefined
  });

  it("shows empty state when page has no widgets", () => {
    renderWithProviders(
      <DashboardContainer page={makePage([])} editable={true} />,
    );

    expect(screen.getByText("No widgets to display")).toBeInTheDocument();
  });

  it("calls onEditWidget with correct widget in multi-widget page", async () => {
    const user = userEvent.setup();
    const onEditWidget = vi.fn();
    const widget1 = makeWidget({ id: "w-1", settings: { title: "Widget 1" } });
    const widget2 = makeWidget({ id: "w-2", settings: { title: "Widget 2" } });

    renderWithProviders(
      <DashboardContainer
        page={makePage([widget1, widget2])}
        editable={true}
        actions={{ onEditWidget }}
      />,
    );

    const widgetDivs = screen.getAllByTestId("widget-card");
    expect(widgetDivs).toHaveLength(2);

    // Double-click the second widget
    await user.dblClick(widgetDivs[1]);

    expect(onEditWidget).toHaveBeenCalledTimes(1);
    expect(onEditWidget).toHaveBeenCalledWith(widget2);
  });
});
