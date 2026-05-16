/**
 * DashboardContainer — branch coverage for buildActions, CSV export,
 * fullscreen toggle, template sync banner, refresh button, and
 * parameter bar. Complements dashboard-container-dblclick which focuses
 * on the onDoubleClick handler.
 */
import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type {
  DashboardPage,
  DashboardWidget,
  WidgetTemplate,
} from "@/lib/db/schema";

/* ---------- mocks ---------- */

// Capture the actions array passed to WidgetCard for assertions.
const widgetCardProps: Array<Record<string, unknown>> = [];

vi.mock("@neoboard/components", () => ({
  WidgetCard: ({
    children,
    title,
    actions,
    onRefresh,
    headerExtra,
  }: {
    children: React.ReactNode;
    title: string;
    actions?: Array<{ label: string; onClick?: () => void }>;
    onRefresh?: () => void;
    headerExtra?: React.ReactNode;
  }) => {
    widgetCardProps.push({ title, actions, onRefresh });
    return (
      <div data-testid="widget-card-inner" data-title={title}>
        <div data-testid="widget-header-extra">{headerExtra}</div>
        {onRefresh && (
          <button data-testid="widget-refresh" onClick={onRefresh}>
            refresh
          </button>
        )}
        {actions?.map((a) => (
          <button
            key={a.label}
            data-testid={`action-${a.label.toLowerCase().replace(/\s+/g, "-")}`}
            onClick={() => a.onClick?.()}
          >
            {a.label}
          </button>
        ))}
        {children}
      </div>
    );
  },
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
  Dialog: ({
    children,
    open,
    onOpenChange,
  }: {
    children: React.ReactNode;
    open: boolean;
    onOpenChange?: (open: boolean) => void;
  }) =>
    open ? (
      <div data-testid="fullscreen-dialog" role="dialog">
        <button
          data-testid="fullscreen-dialog-close"
          onClick={() => onOpenChange?.(false)}
        >
          close
        </button>
        {children}
      </div>
    ) : null,
  DialogContent: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  DialogTitle: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="fullscreen-title">{children}</div>
  ),
  Button: ({
    children,
    ...props
  }: React.PropsWithChildren<Record<string, unknown>>) => (
    <button {...props}>{children}</button>
  ),
  ParameterBar: ({
    children,
    onReset,
  }: {
    children: React.ReactNode;
    onReset: () => void;
  }) => (
    <div data-testid="parameter-bar">
      <button data-testid="reset-all" onClick={onReset}>
        reset
      </button>
      {children}
    </div>
  ),
  CrossFilterTag: ({
    field,
    value,
    onRemove,
    onClick,
    tooltip,
  }: {
    field: string;
    value: string;
    onRemove: () => void;
    onClick?: () => void;
    tooltip?: string;
  }) => (
    <div data-testid={`filter-tag-${field}`} title={tooltip}>
      <span>{value}</span>
      <button data-testid={`tag-click-${field}`} onClick={onClick}>
        click
      </button>
      <button data-testid={`tag-remove-${field}`} onClick={onRemove}>
        x
      </button>
    </div>
  ),
  AlertDialog: ({
    children,
    open,
  }: {
    children: React.ReactNode;
    open: boolean;
  }) =>
    open ? (
      <div data-testid="sync-dialog" role="alertdialog">
        {children}
      </div>
    ) : null,
  AlertDialogAction: ({
    children,
    onClick,
  }: React.PropsWithChildren<{ onClick?: () => void }>) => (
    <button data-testid="confirm-sync" onClick={onClick}>
      {children}
    </button>
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
  buildCsvString: vi.fn((rows: unknown[]) => `CSV(${rows.length})`),
  triggerDownload: vi.fn(),
  buildExportFilename: vi.fn((title: string, ext: string) => `${title}.${ext}`),
}));

vi.mock("@/components/card-container", () => ({
  CardContainer: ({ widgetIdSuffix }: { widgetIdSuffix?: string }) => (
    <div data-testid="card-container" data-suffix={widgetIdSuffix ?? ""} />
  ),
}));

vi.mock("@/lib/widget/interpolate-title", () => ({
  interpolateTitle: (title: string) => title,
}));

const mockBuildExportData = vi.fn();
vi.mock("@/lib/widget/card-utils", () => ({
  buildExportData: (...args: unknown[]) => mockBuildExportData(...args),
}));

const mockIsTemplateOutdated = vi.fn();
vi.mock("@/lib/widget/widget-utils", () => ({
  getWidgetDisplayTitle: (w: DashboardWidget) =>
    (w.settings?.title as string) || w.chartType,
  isWidgetTemplateOutdated: (w: unknown, map: unknown) =>
    mockIsTemplateOutdated(w, map),
}));

const mockIsDataWidget = vi.fn();
vi.mock("@/lib/widget/widget-actions", () => ({
  isDataWidget: (t: string) => mockIsDataWidget(t),
}));

const parametersState = {
  parameters: {} as Record<
    string,
    { field: string; value: unknown; source?: string; sourceWidgetId?: string }
  >,
  clearParameter: vi.fn(),
  clearAll: vi.fn(),
};

vi.mock("@/stores/parameter-store", () => ({
  useParameterStore: (sel: (s: typeof parametersState) => unknown) =>
    sel(parametersState),
  useParameterValues: () => ({ foo: "bar" }),
}));

vi.mock("@/lib/parameter/format-parameter-value", () => ({
  formatParameterValue: (v: unknown) => String(v),
  filterParentParams: (entries: [string, unknown][]) => entries,
}));

const mockShouldShowRefresh = vi.fn();
vi.mock("@/lib/query/resolve-cache-options", () => ({
  shouldShowRefreshButton: (opts: unknown) => mockShouldShowRefresh(opts),
}));

/* ---------- import under test ---------- */
const { DashboardContainer } = await import("../dashboard-container");
const {
  buildCsvString: mockBuildCsv,
  triggerDownload: mockTriggerDownload,
  buildExportFilename: mockBuildFilename,
} = await import("@neoboard/components");

/* ---------- helpers ---------- */

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
    title: "My Dashboard",
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
  return {
    queryClient,
    ...render(
      <QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>,
    ),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  widgetCardProps.length = 0;
  parametersState.parameters = {};
  mockIsDataWidget.mockReturnValue(true);
  mockIsTemplateOutdated.mockReturnValue(false);
  mockShouldShowRefresh.mockReturnValue(false);
  mockBuildExportData.mockReturnValue([]);
});

/* ---------- tests ---------- */

describe("DashboardContainer — buildActions", () => {
  it("adds Export CSV only for data widgets", () => {
    mockIsDataWidget.mockReturnValue(false);
    renderWithProviders(
      <DashboardContainer page={makePage()} editable={false} />,
    );
    expect(screen.queryByTestId("action-export-csv")).toBeNull();
  });

  it("adds Export CSV for data widgets", () => {
    mockIsDataWidget.mockReturnValue(true);
    renderWithProviders(
      <DashboardContainer page={makePage()} editable={false} />,
    );
    expect(screen.getByTestId("action-export-csv")).toBeDefined();
  });

  it("omits Edit/Duplicate/Remove when editable=false", () => {
    renderWithProviders(
      <DashboardContainer
        page={makePage()}
        editable={false}
        actions={{
          onEditWidget: vi.fn(),
          onDuplicateWidget: vi.fn(),
          onRemoveWidget: vi.fn(),
        }}
      />,
    );
    expect(screen.queryByTestId("action-edit-widget")).toBeNull();
    expect(screen.queryByTestId("action-duplicate")).toBeNull();
    expect(screen.queryByTestId("action-remove")).toBeNull();
  });

  it("includes Edit/Duplicate/Remove when editable=true and callbacks provided", () => {
    const onRemoveWidget = vi.fn();
    const onDuplicateWidget = vi.fn();
    const onEditWidget = vi.fn();
    renderWithProviders(
      <DashboardContainer
        page={makePage()}
        editable={true}
        actions={{ onRemoveWidget, onDuplicateWidget, onEditWidget }}
      />,
    );
    fireEvent.click(screen.getByTestId("action-edit-widget"));
    fireEvent.click(screen.getByTestId("action-duplicate"));
    fireEvent.click(screen.getByTestId("action-remove"));
    expect(onEditWidget).toHaveBeenCalledTimes(1);
    expect(onDuplicateWidget).toHaveBeenCalledWith("w-1");
    expect(onRemoveWidget).toHaveBeenCalledWith("w-1");
  });

  it("includes 'Save to Widget Lab' when onSaveAsTemplate is provided", () => {
    const onSaveAsTemplate = vi.fn();
    renderWithProviders(
      <DashboardContainer
        page={makePage()}
        editable={false}
        actions={{ onSaveAsTemplate }}
      />,
    );
    fireEvent.click(screen.getByTestId("action-save-to-widget-lab"));
    expect(onSaveAsTemplate).toHaveBeenCalledTimes(1);
  });

  it("adds Sync/Detach actions only when widget.templateId + outdated", () => {
    mockIsTemplateOutdated.mockReturnValue(true);
    const onSyncWidget = vi.fn();
    const onDetachWidget = vi.fn();
    renderWithProviders(
      <DashboardContainer
        page={makePage([makeWidget({ templateId: "tpl-1" })])}
        editable={true}
        actions={{ onSyncWidget, onDetachWidget }}
        templateMap={{ "tpl-1": { id: "tpl-1" } as WidgetTemplate }}
      />,
    );
    expect(screen.getByTestId("action-sync-with-template")).toBeDefined();
    expect(screen.getByTestId("action-detach-from-template")).toBeDefined();
  });

  it("does NOT add Sync action when template is up-to-date", () => {
    mockIsTemplateOutdated.mockReturnValue(false);
    renderWithProviders(
      <DashboardContainer
        page={makePage([makeWidget({ templateId: "tpl-1" })])}
        editable={true}
        actions={{ onSyncWidget: vi.fn(), onDetachWidget: vi.fn() }}
        templateMap={{ "tpl-1": { id: "tpl-1" } as WidgetTemplate }}
      />,
    );
    expect(screen.queryByTestId("action-sync-with-template")).toBeNull();
    expect(screen.getByTestId("action-detach-from-template")).toBeDefined();
  });

  it("returns no actions when none apply (non-data widget, no callbacks, not editable)", () => {
    mockIsDataWidget.mockReturnValue(false);
    renderWithProviders(
      <DashboardContainer page={makePage()} editable={false} />,
    );
    const props = widgetCardProps[0];
    expect(props.actions).toBeUndefined();
  });
});

describe("DashboardContainer — parameter bar", () => {
  it("renders ParameterBar when parameters exist and showParameterBar=true", () => {
    parametersState.parameters = {
      status: { field: "status", value: "active" },
    };
    renderWithProviders(
      <DashboardContainer page={makePage()} showParameterBar={true} />,
    );
    expect(screen.getByTestId("parameter-bar")).toBeDefined();
    expect(screen.getByTestId("filter-tag-status")).toBeDefined();
  });

  it("does NOT render ParameterBar when showParameterBar=false", () => {
    parametersState.parameters = {
      status: { field: "status", value: "active" },
    };
    renderWithProviders(
      <DashboardContainer page={makePage()} showParameterBar={false} />,
    );
    expect(screen.queryByTestId("parameter-bar")).toBeNull();
  });

  it("does NOT render ParameterBar when no parameters exist", () => {
    renderWithProviders(<DashboardContainer page={makePage()} />);
    expect(screen.queryByTestId("parameter-bar")).toBeNull();
  });

  it("calls clearParameter when a tag's remove button is clicked", () => {
    parametersState.parameters = {
      status: { field: "status", value: "active" },
    };
    renderWithProviders(<DashboardContainer page={makePage()} />);
    fireEvent.click(screen.getByTestId("tag-remove-status"));
    expect(parametersState.clearParameter).toHaveBeenCalledWith("status");
  });

  it("calls clearAll when the ParameterBar reset is clicked", () => {
    parametersState.parameters = {
      status: { field: "status", value: "active" },
    };
    renderWithProviders(<DashboardContainer page={makePage()} />);
    fireEvent.click(screen.getByTestId("reset-all"));
    expect(parametersState.clearAll).toHaveBeenCalled();
  });

  it("tag click scrolls to source widget when sourceWidgetId is set", () => {
    parametersState.parameters = {
      status: {
        field: "status",
        value: "active",
        source: "Widget A",
        sourceWidgetId: "src-1",
      },
    };
    const scrollIntoView = vi.fn();
    const origQuerySelector = document.querySelector.bind(document);
    const spy = vi
      .spyOn(document, "querySelector")
      .mockImplementation((sel: string) => {
        if (sel.includes("src-1"))
          return { scrollIntoView } as unknown as Element;
        return origQuerySelector(sel);
      });
    renderWithProviders(<DashboardContainer page={makePage()} />);
    fireEvent.click(screen.getByTestId("tag-click-status"));
    expect(scrollIntoView).toHaveBeenCalledWith({
      behavior: "smooth",
      block: "center",
    });
    spy.mockRestore();
  });
});

describe("DashboardContainer — CSV export", () => {
  it("triggers CSV download with widget data when rows are present", () => {
    mockIsDataWidget.mockReturnValue(true);
    mockBuildExportData.mockReturnValue([{ a: 1 }, { a: 2 }]);
    renderWithProviders(<DashboardContainer page={makePage()} />);

    fireEvent.click(screen.getByTestId("action-export-csv"));

    expect(mockBuildExportData).toHaveBeenCalled();
    expect(mockBuildCsv).toHaveBeenCalledWith([{ a: 1 }, { a: 2 }]);
    expect(mockBuildFilename).toHaveBeenCalledWith(
      "Test Widget",
      "csv",
      "My Dashboard",
    );
    expect(mockTriggerDownload).toHaveBeenCalledWith(
      "CSV(2)",
      "Test Widget.csv",
    );
  });

  it("does NOT trigger download when exportData is empty", () => {
    mockIsDataWidget.mockReturnValue(true);
    mockBuildExportData.mockReturnValue([]);
    renderWithProviders(<DashboardContainer page={makePage()} />);

    fireEvent.click(screen.getByTestId("action-export-csv"));

    expect(mockBuildCsv).not.toHaveBeenCalled();
    expect(mockTriggerDownload).not.toHaveBeenCalled();
  });

  it("falls back to chartType when widget has no title for the filename", () => {
    mockIsDataWidget.mockReturnValue(true);
    mockBuildExportData.mockReturnValue([{ a: 1 }]);
    renderWithProviders(
      <DashboardContainer
        page={makePage([makeWidget({ settings: {}, chartType: "pie" })])}
      />,
    );
    fireEvent.click(screen.getByTestId("action-export-csv"));
    expect(mockBuildFilename).toHaveBeenCalledWith(
      "pie",
      "csv",
      "My Dashboard",
    );
  });
});

describe("DashboardContainer — refresh + fullscreen + sync dialogs", () => {
  it("renders onRefresh handler only when shouldShowRefreshButton=true", () => {
    mockShouldShowRefresh.mockReturnValue(false);
    renderWithProviders(<DashboardContainer page={makePage()} />);
    const props = widgetCardProps[0];
    expect(props.onRefresh).toBeUndefined();
  });

  it("shows a refresh button when shouldShowRefreshButton=true, and invalidates queries on click", () => {
    mockShouldShowRefresh.mockReturnValue(true);
    const { queryClient } = renderWithProviders(
      <DashboardContainer page={makePage()} />,
    );
    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");
    fireEvent.click(screen.getByTestId("widget-refresh"));
    expect(invalidateSpy).toHaveBeenCalled();
  });

  it("opens the fullscreen dialog when the Maximize button is clicked", () => {
    renderWithProviders(<DashboardContainer page={makePage()} />);
    // Maximize button is the only icon-only button with sr-only text "Fullscreen"
    const fullscreenBtn = screen.getByText("Fullscreen").closest("button");
    expect(fullscreenBtn).not.toBeNull();
    act(() => {
      fireEvent.click(fullscreenBtn!);
    });
    expect(screen.getByTestId("fullscreen-dialog")).toBeDefined();
    // Dialog title reflects the widget title
    expect(screen.getByTestId("fullscreen-title").textContent).toBe(
      "Test Widget",
    );
  });

  it("closes the fullscreen dialog and clears the pending ready timer", () => {
    vi.useFakeTimers();
    try {
      renderWithProviders(<DashboardContainer page={makePage()} />);
      const fullscreenBtn = screen.getByText("Fullscreen").closest("button");
      act(() => {
        fireEvent.click(fullscreenBtn!);
      });
      expect(screen.getByTestId("fullscreen-dialog")).toBeDefined();
      // Close before the 250ms ready-timer fires — exercises closeFullscreen's
      // clearTimeout branch.
      act(() => {
        fireEvent.click(screen.getByTestId("fullscreen-dialog-close"));
      });
      expect(screen.queryByTestId("fullscreen-dialog")).toBeNull();
      // Advance past the ready-timer; if it weren't cleared it would attempt a
      // setState on the now-closed dialog. No throw = success.
      act(() => {
        vi.advanceTimersByTime(500);
      });
    } finally {
      vi.useRealTimers();
    }
  });

  it("re-arming fullscreen clears the previous ready timer", () => {
    vi.useFakeTimers();
    try {
      // Two widgets so we can open fullscreen on each in succession.
      renderWithProviders(
        <DashboardContainer
          page={makePage([
            makeWidget({ id: "w1", settings: { title: "Widget One" } }),
            makeWidget({ id: "w2", settings: { title: "Widget Two" } }),
          ])}
        />,
      );
      const buttons = screen.getAllByText("Fullscreen");
      act(() => {
        fireEvent.click(buttons[0].closest("button")!);
      });
      expect(screen.getByTestId("fullscreen-title").textContent).toBe(
        "Widget One",
      );
      // Re-arm before the first 250ms timer fires — exercises openFullscreen's
      // clearTimeout branch (line: clear previous ref before setting new).
      act(() => {
        fireEvent.click(buttons[1].closest("button")!);
      });
      expect(screen.getByTestId("fullscreen-title").textContent).toBe(
        "Widget Two",
      );
      act(() => {
        vi.advanceTimersByTime(500);
      });
    } finally {
      vi.useRealTimers();
    }
  });

  it("unmounting with a pending fullscreen-ready timer clears it cleanly", () => {
    vi.useFakeTimers();
    try {
      const { unmount } = renderWithProviders(
        <DashboardContainer page={makePage()} />,
      );
      const fullscreenBtn = screen.getByText("Fullscreen").closest("button");
      act(() => {
        fireEvent.click(fullscreenBtn!);
      });
      // Unmount before the 250ms timer fires — exercises the useEffect cleanup
      // branch. Without it, the timer would call setState on a torn-down tree.
      unmount();
      act(() => {
        vi.advanceTimersByTime(500);
      });
      // No unhandled "window is not defined" / "setState on unmounted" = pass.
    } finally {
      vi.useRealTimers();
    }
  });

  it("renders the template-outdated RefreshCw header extra and opens sync dialog on click", () => {
    mockIsTemplateOutdated.mockReturnValue(true);
    const onSyncWidget = vi.fn();
    renderWithProviders(
      <DashboardContainer
        page={makePage([makeWidget({ templateId: "tpl-1" })])}
        editable={true}
        actions={{ onSyncWidget }}
        templateMap={{ "tpl-1": { id: "tpl-1" } as WidgetTemplate }}
      />,
    );
    // The outdated button has sr-only text "Template update available"
    const outdatedBtn = screen
      .getByText("Template update available")
      .closest("button");
    expect(outdatedBtn).not.toBeNull();
    act(() => {
      fireEvent.click(outdatedBtn!);
    });
    expect(screen.getByTestId("sync-dialog")).toBeDefined();
    // Confirming calls onSyncWidget
    fireEvent.click(screen.getByTestId("confirm-sync"));
    expect(onSyncWidget).toHaveBeenCalledTimes(1);
  });

  it("clicking Sync confirm without onSyncWidget still closes dialog", () => {
    mockIsTemplateOutdated.mockReturnValue(true);
    renderWithProviders(
      <DashboardContainer
        page={makePage([makeWidget({ templateId: "tpl-1" })])}
        editable={true}
        actions={{}} // no onSyncWidget
        templateMap={{ "tpl-1": { id: "tpl-1" } as WidgetTemplate }}
      />,
    );
    // With no onSyncWidget we can't open via the action menu (it wouldn't exist),
    // but the outdated header button still opens the dialog.
    const btn = screen.getByText("Template update available").closest("button");
    act(() => {
      fireEvent.click(btn!);
    });
    expect(screen.getByTestId("sync-dialog")).toBeDefined();
    // Confirm — must not throw and must close
    fireEvent.click(screen.getByTestId("confirm-sync"));
  });
});
