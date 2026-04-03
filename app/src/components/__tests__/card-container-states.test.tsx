import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import React from "react";

/* ---------- mocks (must be declared before imports) ---------- */

// Stub out heavy component-library and dynamic imports
vi.mock("@neoboard/components", () => ({
  Skeleton: ({ className }: { className?: string }) => (
    <div data-testid="skeleton" className={className} />
  ),
  EmptyState: ({
    title,
    description,
    icon,
  }: {
    title: string;
    description?: string;
    icon?: React.ReactNode;
  }) => (
    <div data-testid="empty-state">
      <span>{title}</span>
      {description && <span>{description}</span>}
      {icon}
    </div>
  ),
  Alert: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  AlertTitle: ({ children }: { children: React.ReactNode }) => (
    <span>{children}</span>
  ),
  AlertDescription: ({ children }: { children: React.ReactNode }) => (
    <span>{children}</span>
  ),
  Button: ({
    children,
    ...rest
  }: React.ButtonHTMLAttributes<HTMLButtonElement>) => (
    <button {...rest}>{children}</button>
  ),
  Popover: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  PopoverTrigger: ({ children }: { children: React.ReactNode }) => (
    <>{children}</>
  ),
  PopoverContent: ({ children }: { children: React.ReactNode }) => (
    <>{children}</>
  ),
  ColumnMappingOverlay: () => <div data-testid="column-mapping-overlay" />,
  substituteParams: (s: string) => s,
}));

vi.mock("next/dynamic", () => ({
  default: () =>
    function DynamicStub() {
      return <div data-testid="dynamic-stub" />;
    },
}));

// Mock chart-renderer to avoid pulling chart deps
vi.mock("@/components/chart-renderer", () => ({
  ChartRenderer: () => <div data-testid="chart-renderer" />,
}));

// Mock hooks
const mockUseWidgetQuery = vi.fn();
vi.mock("@/hooks/use-widget-query", () => ({
  useWidgetQuery: (...args: unknown[]) => mockUseWidgetQuery(...args),
}));

vi.mock("@/hooks/use-click-action", () => ({
  useClickAction: () => ({
    handleChartClick: vi.fn(),
    hasClickAction: false,
    clickableColumns: [],
  }),
}));

vi.mock("@/stores/parameter-store", () => ({
  useParameterStore: (sel: (s: Record<string, unknown>) => unknown) =>
    sel({ parameters: {} }),
  useParameterValues: () => ({}),
}));

vi.mock("@/lib/resolve-cache-options", () => ({
  resolveCacheOptions: () => ({ staleTime: 0, gcTime: undefined }),
}));

vi.mock("@/lib/card-utils", () => ({
  extractColumnNames: () => [],
  resolveStylingConfig: () => undefined,
}));

vi.mock("@/lib/scroll-to-widget", () => ({
  scrollAndHighlight: () => false,
}));

vi.mock("@/lib/data-transforms", () => ({
  applyTransforms: (d: unknown) => d,
}));

/* ---------- import under test ---------- */
import { CardContainer } from "../card-container";
import type { DashboardWidget } from "@/lib/db/schema";

/** Helper to create a minimal widget. */
function makeWidget(overrides: Partial<DashboardWidget> = {}): DashboardWidget {
  return {
    id: "w1",
    chartType: "bar",
    connectionId: "conn-1",
    query: "MATCH (n) RETURN n.name AS name, count(*) AS value",
    ...overrides,
  };
}

describe("CardContainer", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ----- Missing connection -----

  it('shows "No connection configured" when connectionId is empty', () => {
    mockUseWidgetQuery.mockReturnValue({
      isPending: true,
      fetchStatus: "idle",
      isError: false,
      data: undefined,
      missingParams: [],
    });

    render(<CardContainer widget={makeWidget({ connectionId: "" })} />);

    expect(screen.getByText("No connection configured")).toBeDefined();
    expect(
      screen.getByText(
        "Select a connection in the widget settings to start querying data.",
      ),
    ).toBeDefined();
    // Should NOT show "Waiting for parameters"
    expect(screen.queryByText(/Waiting for parameters/)).toBeNull();
  });

  // ----- Missing query -----

  it('shows "No query configured" when query is empty', () => {
    mockUseWidgetQuery.mockReturnValue({
      isPending: true,
      fetchStatus: "idle",
      isError: false,
      data: undefined,
      missingParams: [],
    });

    render(
      <CardContainer
        widget={makeWidget({ connectionId: "conn-1", query: "" })}
      />,
    );

    expect(screen.getByText("No query configured")).toBeDefined();
    expect(
      screen.getByText("Add a query in the widget settings."),
    ).toBeDefined();
    expect(screen.queryByText(/Waiting for parameters/)).toBeNull();
  });

  // ----- Missing parameters -----

  it('shows "Waiting for parameters" only when connectionId and query are set but params are unresolved', () => {
    mockUseWidgetQuery.mockReturnValue({
      isPending: true,
      fetchStatus: "idle",
      isError: false,
      data: undefined,
      missingParams: ["region"],
    });

    render(
      <CardContainer
        widget={makeWidget({
          connectionId: "conn-1",
          query: "MATCH (n) WHERE n.region = $param_region RETURN n",
        })}
      />,
    );

    expect(screen.getByText(/Waiting for parameters/)).toBeDefined();
    // Parameter badge should be rendered
    expect(screen.getByText("$param_region")).toBeDefined();
  });

  // ----- Loading state (query actively fetching) -----

  it("shows loading skeleton when query is actively fetching", () => {
    mockUseWidgetQuery.mockReturnValue({
      isPending: true,
      fetchStatus: "fetching",
      isError: false,
      data: undefined,
      missingParams: [],
    });

    render(<CardContainer widget={makeWidget()} />);

    // Should render skeleton loaders (data-loading=true container)
    const skeletons = screen.getAllByTestId("skeleton");
    expect(skeletons.length).toBeGreaterThan(0);
  });

  // ----- Error state -----

  it("shows error alert when query fails", () => {
    mockUseWidgetQuery.mockReturnValue({
      isPending: false,
      fetchStatus: "idle",
      isError: true,
      error: new Error("Connection refused"),
      data: undefined,
      missingParams: [],
    });

    render(<CardContainer widget={makeWidget()} />);

    expect(screen.getByText("Query Failed")).toBeDefined();
    expect(screen.getByText("Connection refused")).toBeDefined();
  });

  // ----- Successful render -----

  it("renders chart when query returns data", () => {
    mockUseWidgetQuery.mockReturnValue({
      isPending: false,
      fetchStatus: "idle",
      isError: false,
      data: {
        data: [{ name: "Alice", value: 10 }],
        resultId: "r1",
      },
      missingParams: [],
    });

    render(<CardContainer widget={makeWidget()} />);

    expect(screen.getByTestId("chart-renderer")).toBeDefined();
  });

  // ----- Priority: connectionId check comes before parameter check -----

  it("prioritises missing connection message over missing parameters", () => {
    mockUseWidgetQuery.mockReturnValue({
      isPending: true,
      fetchStatus: "idle",
      isError: false,
      data: undefined,
      missingParams: ["region"],
    });

    render(
      <CardContainer
        widget={makeWidget({
          connectionId: "",
          query: "MATCH (n) WHERE n.region = $param_region RETURN n",
        })}
      />,
    );

    // Connection message should win over parameter message
    expect(screen.getByText("No connection configured")).toBeDefined();
    expect(screen.queryByText(/Waiting for parameters/)).toBeNull();
  });

  // ----- Manual run overlay -----

  it("shows manual run overlay when manualRun is enabled and query has not been run", () => {
    mockUseWidgetQuery.mockReturnValue({
      isPending: true,
      fetchStatus: "idle",
      isError: false,
      data: undefined,
      missingParams: [],
    });

    render(
      <CardContainer
        widget={makeWidget({
          settings: { chartOptions: { manualRun: true } },
        })}
      />,
    );

    expect(screen.getByTestId("manual-run-overlay")).toBeDefined();
    expect(screen.getByText("Query execution is paused.")).toBeDefined();
    expect(screen.getByRole("button", { name: /run query/i })).toBeDefined();
  });

  // ----- No data state -----

  it('shows "No data" when query returns null data', () => {
    mockUseWidgetQuery.mockReturnValue({
      isPending: false,
      fetchStatus: "idle",
      isError: false,
      data: null,
      missingParams: [],
    });

    render(<CardContainer widget={makeWidget()} />);

    expect(screen.getByText("No data")).toBeDefined();
  });

  // ----- Parameter-select widget (no query) -----

  it("renders chart directly for parameter-select widgets without querying", () => {
    mockUseWidgetQuery.mockReturnValue({
      isPending: false,
      fetchStatus: "idle",
      isError: false,
      data: null,
      missingParams: [],
    });

    render(
      <CardContainer
        widget={makeWidget({ chartType: "bar", connectionId: "conn-1" })}
        previewData={[{ name: "A", value: 1 }]}
      />,
    );

    expect(screen.getByTestId("chart-renderer")).toBeDefined();
  });

  // ----- Truncation warning -----

  it("shows truncation warning when data is truncated", () => {
    mockUseWidgetQuery.mockReturnValue({
      isPending: false,
      fetchStatus: "idle",
      isError: false,
      data: {
        data: [{ name: "Alice", value: 10 }],
        resultId: "r1",
        truncated: true,
      },
      missingParams: [],
    });

    render(<CardContainer widget={makeWidget()} />);

    expect(screen.getByText(/Showing first 10,000 rows/)).toBeDefined();
  });

  it("does not show truncation warning when data is not truncated", () => {
    mockUseWidgetQuery.mockReturnValue({
      isPending: false,
      fetchStatus: "idle",
      isError: false,
      data: {
        data: [{ name: "Alice", value: 10 }],
        resultId: "r1",
        truncated: false,
      },
      missingParams: [],
    });

    render(<CardContainer widget={makeWidget()} />);

    expect(screen.queryByText(/Showing first 10,000 rows/)).toBeNull();
  });
});
