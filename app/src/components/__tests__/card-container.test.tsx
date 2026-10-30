/**
 * CardContainer tests — focused on the widgetIdSuffix prop that prevents
 * graph store conflicts when two CardContainers render the same widget
 * (e.g. normal view + fullscreen dialog).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { useEffect } from "react";
import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { DashboardWidget } from "@/lib/db/schema";

// ── Capture ChartRenderer props to verify effectiveWidgetId ───────────
let capturedChartProps: Record<string, unknown> = {};
let chartMounts = 0;

vi.mock("@/components/chart-renderer", () => ({
  ChartRenderer: (props: Record<string, unknown>) => {
    capturedChartProps = props;
    useEffect(() => {
      chartMounts++;
    }, []);
    return <div data-testid="chart-renderer" />;
  },
}));

/** What the stubbed widget query resolved to; null is "no data". */
let widgetQueryData: unknown = null;
/** The stubbed query is refetching and still shows its previous data. */
let widgetQueryPlaceholder = false;

vi.mock("@/hooks/use-widget-query", () => ({
  useWidgetQuery: () => ({
    isPending: false,
    isError: false,
    data: widgetQueryData,
    isPlaceholderData: widgetQueryPlaceholder,
    fetchStatus: "idle",
    missingParams: [],
  }),
}));

let hasClickAction = false;
let paramValuesNow: Record<string, unknown> = {};

vi.mock("@/hooks/use-click-action", () => ({
  useClickAction: () => ({
    handleChartClick: undefined,
    hasClickAction,
    clickableColumns: [],
  }),
}));

vi.mock("@/stores/parameter-store", () => ({
  useParameterValues: () => paramValuesNow,
  useParameterStore: (sel: (s: { parameters: object }) => unknown) =>
    sel({ parameters: {} }),
}));

vi.mock("@/lib/plugin/chart-helpers", () => ({
  getChartConfig: (type: string) => {
    if (
      ["bar", "markdown", "parameter-select", "form", "graph"].includes(type)
    ) {
      return {
        type,
        label: type,
        transform: (d: unknown) => d,
        transformWithMapping: (d: unknown) => d,
        validate: () => null,
        capabilities: {
          supportsClickAction: true,
          supportsStyling: false,
          isECharts: false,
          requiresQuery: true,
        },
      };
    }
    return null;
  },
  supportsColumnMapping: () => false,
  connectorMismatch: () => null,
}));

vi.mock("@/lib/query/resolve-cache-options", () => ({
  resolveWidgetCacheOptions: () => ({ staleTime: 0, gcTime: 0 }),
}));

vi.mock("@/lib/widget/scroll-to-widget", () => ({
  scrollAndHighlight: () => false,
}));

vi.mock("@neoboard/components", () => ({
  Skeleton: () => <div data-testid="skeleton" />,
  Alert: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  AlertDescription: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  AlertTitle: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  Button: ({
    children,
    onClick,
  }: {
    children: React.ReactNode;
    onClick?: () => void;
  }) => <button onClick={onClick}>{children}</button>,
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
  ColumnMappingOverlay: () => null,
  substituteParams: (s: string) => s,
  Popover: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  PopoverTrigger: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  PopoverContent: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
}));

vi.mock("@/lib/query/data-transforms", () => ({
  applyTransforms: (data: unknown) => data,
}));

vi.mock("@/lib/widget/card-utils", () => ({
  extractColumnNames: () => [],
  resolveStylingConfig: () => undefined,
}));

// Import after mocks
import { CardContainer } from "../card-container";
import { CardRefreshContext } from "../card-refresh-context";

function createWidget(overrides?: Partial<DashboardWidget>): DashboardWidget {
  return {
    id: "widget-123",
    chartType: "markdown",
    connectionId: "conn-1",
    query: "",
    settings: {
      chartOptions: { content: "hello" },
    },
    ...overrides,
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

describe("CardContainer", () => {
  beforeEach(() => {
    capturedChartProps = {};
    chartMounts = 0;
    widgetQueryPlaceholder = false;
    widgetQueryData = null;
    hasClickAction = false;
    paramValuesNow = {};
    vi.clearAllMocks();
  });

  describe("highlight (#2226)", () => {
    // The saved shape: the action beside chartOptions, not inside them.
    const barWidget = () =>
      createWidget({
        chartType: "bar",
        settings: {
          chartOptions: { orientation: "vertical" },
          clickAction: {
            type: "set-parameter",
            parameterMapping: {
              parameterName: "category",
              sourceField: "label",
            },
          },
        },
      });
    const rows = [
      { label: "Home", value: 1 },
      { label: "Outdoors", value: 2 },
    ];
    const highlighted = () =>
      (capturedChartProps.interaction as { highlighted?: unknown[] })
        ?.highlighted;

    it("hands the chart the marks its click action selected", () => {
      hasClickAction = true;
      paramValuesNow = { category: "Home" };
      renderWithProviders(
        <CardContainer widget={barWidget()} previewData={rows} />,
      );
      expect(highlighted()).toEqual(["Home"]);
    });

    it("hands nothing over while the parameter is unset", () => {
      hasClickAction = true;
      renderWithProviders(
        <CardContainer widget={barWidget()} previewData={rows} />,
      );
      expect(highlighted()).toBeUndefined();
    });
  });

  describe("refetching under the line (#2369)", () => {
    const result = (resultId: string) => ({ data: [{ n: 1 }], resultId });
    const barWidget = () =>
      createWidget({ chartType: "bar", query: "RETURN 1", settings: {} });

    it("reports a refetch with its previous rows and keeps the chart, no skeleton", () => {
      const onRefreshingChange = vi.fn();
      widgetQueryData = result("r1");
      widgetQueryPlaceholder = true;
      renderWithProviders(
        <CardRefreshContext.Provider value={onRefreshingChange}>
          <CardContainer widget={barWidget()} />
        </CardRefreshContext.Provider>,
      );
      expect(onRefreshingChange).toHaveBeenLastCalledWith(true);
      expect(screen.getByTestId("chart-renderer")).toBeInTheDocument();
      expect(screen.queryByTestId("skeleton")).not.toBeInTheDocument();
    });

    it("reports not refreshing for a settled result", () => {
      const onRefreshingChange = vi.fn();
      widgetQueryData = result("r1");
      renderWithProviders(
        <CardRefreshContext.Provider value={onRefreshingChange}>
          <CardContainer widget={barWidget()} />
        </CardRefreshContext.Provider>,
      );
      expect(onRefreshingChange).toHaveBeenLastCalledWith(false);
    });

    it("remounts the chart when a new result lands, and not on a rerender of the same one", () => {
      widgetQueryData = result("r1");
      const ui = () => (
        <QueryClientProvider client={new QueryClient()}>
          <CardContainer widget={barWidget()} />
        </QueryClientProvider>
      );
      const { rerender } = render(ui());
      expect(chartMounts).toBe(1);
      rerender(ui());
      expect(chartMounts).toBe(1);
      widgetQueryData = result("r2");
      rerender(ui());
      expect(chartMounts).toBe(2);
    });
  });

  describe("widgetIdSuffix prop", () => {
    it("passes widget.id as widgetId in meta when widgetIdSuffix is not provided", () => {
      const widget = createWidget();
      renderWithProviders(<CardContainer widget={widget} />);

      const meta = capturedChartProps.meta as { widgetId?: string };
      expect(meta?.widgetId).toBe("widget-123");
    });

    it("appends suffix to widgetId when widgetIdSuffix is provided", () => {
      const widget = createWidget();
      renderWithProviders(
        <CardContainer widget={widget} widgetIdSuffix="fullscreen" />,
      );

      const meta = capturedChartProps.meta as { widgetId?: string };
      expect(meta?.widgetId).toBe("widget-123--fullscreen");
    });

    it("uses double-dash separator between widget id and suffix", () => {
      const widget = createWidget({ id: "w-99" });
      renderWithProviders(
        <CardContainer widget={widget} widgetIdSuffix="preview" />,
      );

      const meta = capturedChartProps.meta as { widgetId?: string };
      expect(meta?.widgetId).toBe("w-99--preview");
    });

    it("passes original widget.id when widgetIdSuffix is empty string", () => {
      // Empty string is falsy, so effectiveWidgetId should be widget.id
      const widget = createWidget();
      renderWithProviders(<CardContainer widget={widget} widgetIdSuffix="" />);

      const meta = capturedChartProps.meta as { widgetId?: string };
      expect(meta?.widgetId).toBe("widget-123");
    });
  });

  describe("preview data path with widgetIdSuffix", () => {
    it("passes effectiveWidgetId through meta when rendering with previewData", () => {
      const widget = createWidget({ chartType: "bar" });
      const previewData = [{ name: "A", value: 1 }];
      renderWithProviders(
        <CardContainer
          widget={widget}
          previewData={previewData}
          widgetIdSuffix="fullscreen"
        />,
      );

      const meta = capturedChartProps.meta as { widgetId?: string };
      expect(meta?.widgetId).toBe("widget-123--fullscreen");
    });
  });

  describe("unknown chart type", () => {
    it("shows empty state for unknown chart types", () => {
      const widget = createWidget({ chartType: "nonexistent" });
      renderWithProviders(<CardContainer widget={widget} />);

      expect(screen.getByText("Unknown chart type")).toBeInTheDocument();
    });
  });

  describe("content-only widget paths", () => {
    it("renders markdown widget without querying", () => {
      const widget = createWidget({
        chartType: "markdown",
        settings: { chartOptions: { content: "# Hello" } },
      });
      renderWithProviders(<CardContainer widget={widget} />);

      expect(screen.getByTestId("chart-renderer")).toBeInTheDocument();
    });

    it("passes effectiveWidgetId in meta for content-only widgets", () => {
      const widget = createWidget({
        chartType: "markdown",
        settings: { chartOptions: { content: "test" } },
      });
      renderWithProviders(
        <CardContainer widget={widget} widgetIdSuffix="preview" />,
      );

      const meta = capturedChartProps.meta as { widgetId?: string };
      expect(meta?.widgetId).toBe("widget-123--preview");
    });
  });

  describe("preview data validation", () => {
    it("renders chart when preview data passes validation", () => {
      const widget = createWidget({ chartType: "bar" });
      const previewData = [{ label: "A", count: 10 }];
      renderWithProviders(
        <CardContainer widget={widget} previewData={previewData} />,
      );

      expect(screen.getByTestId("chart-renderer")).toBeInTheDocument();
    });
  });

  // #1824 — a selector's options, a form's submit and field options, and a
  // graph's node expansion all run on the database the widget saves.
  describe("the widget's saved database", () => {
    function metaFor(
      overrides: Partial<DashboardWidget>,
      widgetIdSuffix?: string,
    ) {
      renderWithProviders(
        <CardContainer
          widget={createWidget({ database: "neoboard", ...overrides })}
          widgetIdSuffix={widgetIdSuffix}
        />,
      );
      return capturedChartProps.meta as {
        database?: string;
        widgetId?: string;
      };
    }

    it("reaches a parameter selector", () => {
      expect(metaFor({ chartType: "parameter-select" }).database).toBe(
        "neoboard",
      );
    });

    it("reaches a form, with the id its dashboard stores it under, even fullscreen", () => {
      const meta = metaFor(
        { chartType: "form", query: "CREATE (n)" },
        "fullscreen",
      );
      expect(meta.database).toBe("neoboard");
      expect(meta.widgetId).toBe("widget-123");
    });

    it("reaches a graph", () => {
      widgetQueryData = { data: { nodes: [], edges: [] }, resultId: "r1" };
      const meta = metaFor({ chartType: "graph", query: "MATCH (n) RETURN n" });
      expect(meta.database).toBe("neoboard");
    });

    // #2061: the graph finds its Expand query from the connector the query
    // result names, not from a connection list this user may not see.
    it("hands a graph the connector that ran its query", () => {
      widgetQueryData = {
        data: { nodes: [], edges: [] },
        resultId: "r1",
        connectorType: "fixturedb",
      };
      const meta = metaFor({ chartType: "graph", query: "MATCH (n) RETURN n" });
      expect(meta).toMatchObject({
        resultId: "r1",
        connectorType: "fixturedb",
      });
    });

    it("hands a preview graph the connector that ran the preview", () => {
      renderWithProviders(
        <CardContainer
          widget={createWidget({
            chartType: "graph",
            query: "MATCH (n) RETURN n",
          })}
          previewData={{ nodes: [], edges: [] }}
          previewResultId="r1"
          previewConnectorType="fixturedb"
        />,
      );
      expect(capturedChartProps.meta).toMatchObject({
        resultId: "r1",
        connectorType: "fixturedb",
      });
    });
  });

  describe("form widget path", () => {
    it("renders chart for form widgets without querying", () => {
      // Need to add "form" to the mock chart-helpers
      const widget = createWidget({
        chartType: "bar",
        settings: { chartOptions: {} },
      });
      renderWithProviders(
        <CardContainer widget={widget} previewData={[{ x: 1 }]} />,
      );

      expect(screen.getByTestId("chart-renderer")).toBeInTheDocument();
    });
  });
});
