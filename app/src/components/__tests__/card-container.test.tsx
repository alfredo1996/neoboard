// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import React from "react";

// ---------------------------------------------------------------------------
// Mocks — declared before importing the component under test
// ---------------------------------------------------------------------------

// Expose useWidgetQuery as a controllable spy so individual tests can override.
const mockUseWidgetQuery = vi.hoisted(() =>
  vi.fn(() => ({
    isPending: true,
    isError: false,
    error: null,
    data: null,
    fetchStatus: "fetching", // default: actively fetching (not "idle" waiting state)
    missingParams: [],
  }))
);

vi.mock("@/hooks/use-widget-query", () => ({
  useWidgetQuery: mockUseWidgetQuery,
  getMissingParamNames: vi.fn(() => []),
}));

vi.mock("@/stores/parameter-store", () => ({
  useParameterStore: {
    getState: () => ({ setParameter: vi.fn() }),
  },
}));

vi.mock("@/lib/chart-registry", () => ({
  getChartConfig: (type: string) => {
    if (type === "parameter-select") {
      return {
        type: "parameter-select",
        label: "Parameter Selector",
        transform: (d: unknown) => d,
        transformWithMapping: (d: unknown) => d,
      };
    }
    if (type === "bar") {
      return {
        type: "bar",
        label: "Bar Chart",
        transform: (d: unknown) => d,
        transformWithMapping: (d: unknown) => d,
      };
    }
    if (type === "table") {
      return {
        type: "table",
        label: "Table",
        transform: (d: unknown) => d,
        transformWithMapping: (d: unknown) => d,
      };
    }
    return null;
  },
}));

vi.mock("@/components/parameter-widget-renderer", () => ({
  ParameterWidgetRenderer: (props: Record<string, unknown>) => (
    <div data-testid="parameter-widget-renderer" data-param-name={props.parameterName}>
      Parameter Widget: {String(props.parameterName)}
    </div>
  ),
}));

vi.mock("next/dynamic", () => ({
  __esModule: true,
  default: () => () => <div data-testid="dynamic-component" />,
}));

vi.mock("@/components/graph-exploration-wrapper", () => ({
  GraphExplorationWrapper: () => <div data-testid="graph-exploration-wrapper" />,
}));

vi.mock("@neoboard/components", () => ({
  Skeleton: ({ className }: { className?: string }) => (
    <div data-testid="skeleton" className={className}>loading</div>
  ),
  Alert: ({ children }: { children: React.ReactNode }) => <div role="alert">{children}</div>,
  AlertDescription: ({ children }: { children: React.ReactNode }) => <span>{children}</span>,
  AlertTitle: ({ children }: { children: React.ReactNode }) => <strong>{children}</strong>,
  EmptyState: ({ title, description }: { title: string; description?: string }) => (
    <div data-testid="empty-state" data-title={title}>{description}</div>
  ),
  BarChart: () => <div data-testid="bar-chart" />,
  LineChart: () => <div data-testid="line-chart" />,
  PieChart: () => <div data-testid="pie-chart" />,
  SingleValueChart: () => <div data-testid="single-value-chart" />,
  JsonViewer: () => <div data-testid="json-viewer" />,
  DataGrid: () => <div data-testid="data-grid" />,
  DataGridColumnHeader: ({ title }: { title: string }) => <span>{title}</span>,
  DataGridViewOptions: () => <div data-testid="data-grid-view-options" />,
  DataGridPagination: () => <div data-testid="data-grid-pagination" />,
  ColumnMappingOverlay: () => <div data-testid="column-mapping-overlay" />,
}));

vi.mock("lucide-react", () => ({
  AlertCircle: () => <span>AlertCircle</span>,
}));

// ---------------------------------------------------------------------------
// Component under test
// ---------------------------------------------------------------------------

import { CardContainer } from "../card-container";

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("CardContainer — parameter-select widgets", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanup();
  });

  it("renders parameter-select widget without getting stuck in loading skeleton", () => {
    render(
      <CardContainer
        widget={{
          id: "param-test",
          chartType: "parameter-select",
          connectionId: "conn-123",
          query: "",
          settings: {
            chartOptions: {
              parameterType: "select",
              parameterName: "movie",
              seedQuery: "MATCH (m:Movie) RETURN m.title AS title",
            },
          },
        }}
      />
    );

    // Should NOT show loading skeleton
    expect(screen.queryByTestId("skeleton")).toBeNull();
    expect(screen.queryByText("loading")).toBeNull();

    // Should render the ParameterWidgetRenderer
    const renderer = screen.getByTestId("parameter-widget-renderer");
    expect(renderer).toBeTruthy();
    expect(renderer.getAttribute("data-param-name")).toBe("movie");
  });

  it("renders parameter-select widget with empty connectionId", () => {
    render(
      <CardContainer
        widget={{
          id: "param-text",
          chartType: "parameter-select",
          connectionId: "",
          query: "",
          settings: {
            chartOptions: {
              parameterType: "text",
              parameterName: "search",
            },
          },
        }}
      />
    );

    // Should NOT show loading skeleton
    expect(screen.queryByTestId("skeleton")).toBeNull();

    // Should render the ParameterWidgetRenderer
    expect(screen.getByTestId("parameter-widget-renderer")).toBeTruthy();
  });

  it("shows empty state when parameter-select has no parameterName", () => {
    render(
      <CardContainer
        widget={{
          id: "param-empty",
          chartType: "parameter-select",
          connectionId: "conn-123",
          query: "",
          settings: {
            chartOptions: {
              parameterType: "select",
            },
          },
        }}
      />
    );

    // Should show EmptyState for missing parameter name
    const emptyState = screen.getByTestId("empty-state");
    expect(emptyState).toBeTruthy();
    expect(emptyState.getAttribute("data-title")).toBe("No parameter name");
  });
});

describe("CardContainer — table widget empty state", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanup();
  });

  it("shows default 'No results' empty message when previewData is empty array", () => {
    render(
      <CardContainer
        widget={{
          id: "table-empty",
          chartType: "table",
          connectionId: "conn-123",
          query: "MATCH (n) RETURN n",
          settings: { chartOptions: {} },
        }}
        previewData={[]}
      />
    );

    const emptyState = screen.getByTestId("empty-state");
    expect(emptyState).toBeTruthy();
    expect(emptyState.getAttribute("data-title")).toBe("No results");
  });

  it("shows custom emptyMessage from chartOptions when previewData is empty array", () => {
    render(
      <CardContainer
        widget={{
          id: "table-custom-empty",
          chartType: "table",
          connectionId: "conn-123",
          query: "MATCH (n) RETURN n",
          settings: { chartOptions: { emptyMessage: "No movies found" } },
        }}
        previewData={[]}
      />
    );

    const emptyState = screen.getByTestId("empty-state");
    expect(emptyState).toBeTruthy();
    expect(emptyState.getAttribute("data-title")).toBe("No movies found");
  });
});

describe("CardContainer — waiting for parameters state", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Simulate a disabled query: TanStack Query v5 returns isPending:true +
    // fetchStatus:"idle" when the query is disabled (enabled:false).
    mockUseWidgetQuery.mockReturnValue({
      isPending: true,
      fetchStatus: "idle",
      isError: false,
      error: null,
      data: null,
      missingParams: [],
    });
  });

  afterEach(() => {
    cleanup();
    // Restore default implementation so subsequent suites are unaffected.
    mockUseWidgetQuery.mockImplementation(() => ({
      isPending: true,
      isError: false,
      error: null,
      data: null,
      fetchStatus: "fetching",
      missingParams: [],
    }));
  });

  it("shows 'Waiting for parameters…' message when query is disabled", () => {
    render(
      <CardContainer
        widget={{
          id: "bar-waiting",
          chartType: "bar",
          connectionId: "conn-1",
          query: "MATCH (n {id: $param_nodeId}) RETURN n",
          settings: {},
        }}
      />
    );

    expect(screen.getByText(/Waiting for parameters/)).toBeTruthy();
    // Should NOT fall through to the loading skeleton
    expect(screen.queryByTestId("skeleton")).toBeNull();
  });

  it("shows missing param names as code badges when waiting for parameters", () => {
    mockUseWidgetQuery.mockReturnValue({
      isPending: true,
      fetchStatus: "idle",
      isError: false,
      error: null,
      data: null,
      missingParams: ["nodeId", "genre"],
    });

    render(
      <CardContainer
        widget={{
          id: "bar-waiting-params",
          chartType: "bar",
          connectionId: "conn-1",
          query: "MATCH (n {id: $param_nodeId, genre: $param_genre}) RETURN n",
          settings: {},
        }}
      />
    );

    expect(screen.getByText(/Waiting for parameters/)).toBeTruthy();
    // Missing param badges should be shown
    expect(screen.getByText("$param_nodeId")).toBeTruthy();
    expect(screen.getByText("$param_genre")).toBeTruthy();
  });

  it("does not show param badges when all params are present", () => {
    mockUseWidgetQuery.mockReturnValue({
      isPending: true,
      fetchStatus: "idle",
      isError: false,
      error: null,
      data: null,
      missingParams: [],
    });

    render(
      <CardContainer
        widget={{
          id: "bar-waiting-no-params",
          chartType: "bar",
          connectionId: "conn-1",
          query: "MATCH (n) RETURN n",
          settings: {},
        }}
      />
    );

    expect(screen.getByText(/Waiting for parameters/)).toBeTruthy();
    expect(screen.queryByText(/\$param_/)).toBeNull();
  });

  it("does not show 'Waiting for parameters…' for parameter-select widgets (they bypass query lifecycle)", () => {
    render(
      <CardContainer
        widget={{
          id: "param-waiting",
          chartType: "parameter-select",
          connectionId: "conn-1",
          query: "",
          settings: {
            chartOptions: {
              parameterType: "select",
              parameterName: "genre",
            },
          },
        }}
      />
    );

    // parameter-select is self-contained — it must render its widget, not the waiting message
    expect(screen.queryByText(/Waiting for parameters/)).toBeNull();
    expect(screen.getByTestId("parameter-widget-renderer")).toBeTruthy();
  });
});
