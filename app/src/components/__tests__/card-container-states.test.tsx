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
    role,
  }: {
    title: string;
    description?: string;
    icon?: React.ReactNode;
    role?: React.AriaRole;
  }) => (
    <div data-testid="empty-state" role={role}>
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
  getChartOptions: () => [],
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

vi.mock("@/lib/query/resolve-cache-options", () => ({
  resolveCacheOptions: () => ({ staleTime: 0, gcTime: undefined }),
}));

vi.mock("@/lib/widget/card-utils", () => ({
  extractColumnNames: () => [],
  resolveStylingConfig: () => undefined,
}));

vi.mock("@/lib/widget/scroll-to-widget", () => ({
  scrollAndHighlight: () => false,
}));

vi.mock("@/lib/query/data-transforms", () => ({
  applyTransforms: (d: unknown) => d,
}));

// `chart-helpers` registers *lightweight stub* plugins when the full plugin
// modules haven't loaded, and a stub carries no `validate` — so without this
// the validation path is unreachable from jsdom and #1400 could not be tested
// at this layer at all. Attach the real bar validator; importing the plugin
// module itself would drag ECharts into jsdom for no benefit.
/** Records every argument the host hands to a plugin transform (#1584). */
const transformCalls = vi.hoisted(() => [] as unknown[]);

vi.mock("@/lib/plugin/chart-helpers", async () => {
  const actual = await vi.importActual<
    typeof import("@/lib/plugin/chart-helpers")
  >("@/lib/plugin/chart-helpers");
  const { validateBarData } = await vi.importActual<
    typeof import("@/plugins/bar/transform")
  >("@/plugins/bar/transform");
  return {
    ...actual,
    getChartConfig: (type: string) => {
      const config = actual.getChartConfig(type);
      if (!config) return config;
      const transform = (data: unknown, ...rest: unknown[]) => {
        transformCalls.push(data);
        return (config.transform as (...a: unknown[]) => unknown)(
          data,
          ...rest,
        );
      };
      return {
        ...config,
        transform,
        ...(config.transformWithMapping
          ? {
              transformWithMapping: (data: unknown, ...rest: unknown[]) => {
                transformCalls.push(data);
                return (
                  config.transformWithMapping as (...a: unknown[]) => unknown
                )(data, ...rest);
              },
            }
          : {}),
        ...(type === "bar" ? { validate: validateBarData } : {}),
      };
    },
  };
});

/* ---------- import under test ---------- */
import { CardContainer } from "../card-container";
import type { DashboardWidget } from "@/lib/db/schema";
import {
  ClientQueueTimeoutError,
  ConnectorUnavailableError,
} from "@/lib/api/api-client";
import { hintForConnectionErrorCode } from "@/lib/connector/connection-error-classifier";
import { useConnectionStatusStore } from "@/stores/connection-status-store";
import type { ParameterSourceMap } from "@/lib/parameter/collect-parameter-names";

/**
 * #1678 — a dead connector used to be indistinguishable from an unset
 * parameter: the seed query failed silently, the parameter never arrived,
 * and every dependent widget said "Waiting for parameters…" forever. These
 * pin the two new arms and the one that must NOT change.
 */
describe("CardContainer — connector unavailable (#1678)", () => {
  const idleWaitingForParam = () =>
    mockUseWidgetQuery.mockReturnValue({
      isPending: true,
      fetchStatus: "idle",
      isError: false,
      data: undefined,
      missingParams: ["region"],
    });
  const paramWidget = (over: Partial<DashboardWidget> = {}) =>
    makeWidget({
      connectionId: "conn-1",
      query: "MATCH (n) WHERE n.region = $param_region RETURN n",
      ...over,
    });
  /** `region` is set by a selector whose seed query runs on conn-a. */
  const regionFromConnA: ParameterSourceMap = {
    region: [
      {
        widgetId: "sel",
        widgetTitle: "Region",
        pageId: "p1",
        pageTitle: "Main",
        connectionId: "conn-a",
      },
    ],
  };

  beforeEach(() => {
    vi.clearAllMocks();
    useConnectionStatusStore.getState().reset();
  });

  it("names the connector, not the parameter, when a sibling has flagged the connection", () => {
    useConnectionStatusStore
      .getState()
      .setStatus("conn-1", "error", hintForConnectionErrorCode("network"));
    idleWaitingForParam();

    render(<CardContainer widget={paramWidget()} />);

    expect(screen.getByText("Connector unavailable")).toBeDefined();
    expect(
      screen.getByText(hintForConnectionErrorCode("network")),
    ).toBeDefined();
    expect(screen.queryByText(/Waiting for parameters/)).toBeNull();
  });

  it("still renders the waiting state for a genuinely unset parameter", () => {
    idleWaitingForParam();

    render(<CardContainer widget={paramWidget()} />);

    expect(screen.getByText(/Waiting for parameters/)).toBeDefined();
    expect(screen.getByText("$param_region")).toBeDefined();
    expect(screen.queryByText("Connector unavailable")).toBeNull();
  });

  it("ignores a flag on a different connection", () => {
    useConnectionStatusStore.getState().setStatus("other", "error", "nope");
    idleWaitingForParam();

    render(<CardContainer widget={paramWidget()} />);

    expect(screen.getByText(/Waiting for parameters/)).toBeDefined();
  });

  // The parameter's source can live on a connection other than the
  // widget's own. A healthy widget fed by a selector on a dead connector is
  // exactly the "parameter not chosen" vs "parameter source is broken"
  // ambiguity the issue asked to remove.
  it("names the connector behind the parameter when the widget's own connection is fine", () => {
    useConnectionStatusStore
      .getState()
      .setStatus("conn-a", "error", hintForConnectionErrorCode("auth_failed"));
    idleWaitingForParam();

    render(
      <CardContainer
        widget={paramWidget({ connectionId: "conn-b" })}
        parameterSourceMap={regionFromConnA}
      />,
    );

    expect(screen.getByText("Connector unavailable")).toBeDefined();
    expect(
      screen.getByText(hintForConnectionErrorCode("auth_failed")),
    ).toBeDefined();
    expect(screen.queryByText(/Waiting for parameters/)).toBeNull();
  });

  it("still waits when the flagged connection is neither its own nor the parameter's source", () => {
    useConnectionStatusStore.getState().setStatus("conn-x", "error", "nope");
    idleWaitingForParam();

    render(
      <CardContainer
        widget={paramWidget({ connectionId: "conn-b" })}
        parameterSourceMap={regionFromConnA}
      />,
    );

    expect(screen.getByText(/Waiting for parameters/)).toBeDefined();
    expect(screen.queryByText("Connector unavailable")).toBeNull();
  });

  // Above maxPerUser the overflow widgets get a 408 from the scheduler, and
  // shouldRetryWidgetQuery refuses the retry once the connection is flagged.
  // The card must then say what its siblings say, not "Server timed out".
  it("names the connector, not the queue, when a 408 lands on a connection a sibling has flagged", () => {
    useConnectionStatusStore
      .getState()
      .setStatus("conn-1", "error", hintForConnectionErrorCode("network"));
    const refetch = vi.fn();
    mockUseWidgetQuery.mockReturnValue({
      isPending: false,
      fetchStatus: "idle",
      isError: true,
      error: new ClientQueueTimeoutError("queued", 5000),
      data: undefined,
      missingParams: [],
      refetch,
    });

    render(<CardContainer widget={makeWidget()} />);

    expect(screen.getByText("Connector unavailable")).toBeDefined();
    expect(
      screen.getByText(hintForConnectionErrorCode("network")),
    ).toBeDefined();
    expect(screen.queryByText("Server timed out")).toBeNull();
    screen.getByRole("button", { name: "Retry" }).click();
    expect(refetch).toHaveBeenCalled();
  });

  it("shows the hint and a working Retry on ConnectorUnavailableError; hides the driver text from viewers", () => {
    const refetch = vi.fn();
    mockUseWidgetQuery.mockReturnValue({
      isPending: false,
      fetchStatus: "idle",
      isError: true,
      error: new ConnectorUnavailableError(
        "timeout exceeded when trying to connect",
        "network",
      ),
      data: undefined,
      missingParams: [],
      refetch,
    });

    render(<CardContainer widget={makeWidget()} />);

    expect(screen.getByText("Connector unavailable")).toBeDefined();
    expect(
      screen.getByText(hintForConnectionErrorCode("network")),
    ).toBeDefined();
    expect(screen.queryByText("Query Failed")).toBeNull();
    expect(screen.queryByText(/timeout exceeded/)).toBeNull();
    screen.getByRole("button", { name: "Retry" }).click();
    expect(refetch).toHaveBeenCalled();
  });

  it("adds the driver message for editors, who can fix the connection", () => {
    mockUseWidgetQuery.mockReturnValue({
      isPending: false,
      fetchStatus: "idle",
      isError: true,
      error: new ConnectorUnavailableError(
        "The client is unauthorized due to authentication failure.",
        "auth_failed",
      ),
      data: undefined,
      missingParams: [],
      refetch: vi.fn(),
    });

    render(<CardContainer widget={makeWidget()} isEditMode />);

    expect(
      screen.getByText(hintForConnectionErrorCode("auth_failed")),
    ).toBeDefined();
    expect(screen.getByText(/authentication failure/)).toBeDefined();
  });
});

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
    // The #1678 block flags conn-1 in this module-level store; without a
    // reset, shuffled order leaks "Connector unavailable" into these cases.
    useConnectionStatusStore.getState().reset();
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

  it("hides the raw driver error from viewers; shows a generic message + working Retry (#1050)", () => {
    const refetch = vi.fn();
    mockUseWidgetQuery.mockReturnValue({
      isPending: false,
      fetchStatus: "idle",
      isError: true,
      error: new Error(
        "Invalid input 'INVALID': expected 'CREATE', 'LOAD CSV'…",
      ),
      data: undefined,
      missingParams: [],
      refetch,
    });

    // Default render = view mode (isEditMode falsy) — e.g. a reader on someone
    // else's dashboard.
    render(<CardContainer widget={makeWidget()} />);

    expect(screen.getByText("Query Failed")).toBeDefined();
    expect(screen.getByText(/couldn.t load its data/i)).toBeDefined();
    // The raw driver string and the query text must NOT be in the DOM.
    expect(screen.queryByText(/Invalid input 'INVALID'/)).toBeNull();
    expect(screen.queryByText(/MATCH \(n\) RETURN/)).toBeNull();
    // Retry re-runs the query.
    screen.getByRole("button", { name: "Retry" }).click();
    expect(refetch).toHaveBeenCalled();
  });

  it("shows the raw driver error + query to editors who can fix it (#1050)", () => {
    mockUseWidgetQuery.mockReturnValue({
      isPending: false,
      fetchStatus: "idle",
      isError: true,
      error: new Error("Connection refused"),
      data: undefined,
      missingParams: [],
    });

    render(<CardContainer widget={makeWidget()} isEditMode />);

    expect(screen.getByText("Query Failed")).toBeDefined();
    expect(screen.getByText("Connection refused")).toBeDefined();
    // The query text is shown to help debugging.
    expect(screen.getByText(/MATCH \(n\) RETURN n.name AS name/)).toBeDefined();
  });

  it("shows soft 'Server busy' state with Retry button on QueueFullError", async () => {
    const { QueueFullError } = await import("@/lib/api/api-client");
    const refetch = vi.fn();
    mockUseWidgetQuery.mockReturnValue({
      isPending: false,
      fetchStatus: "idle",
      isError: true,
      error: new QueueFullError("busy", 2000),
      data: undefined,
      missingParams: [],
      refetch,
    });

    render(<CardContainer widget={makeWidget()} />);

    expect(screen.getByText("Server busy")).toBeDefined();
    expect(
      screen.getByText(/server is handling too many queries/i),
    ).toBeDefined();
    expect(screen.queryByText("Query Failed")).toBeNull();
    screen.getByRole("button", { name: /retry/i }).click();
    expect(refetch).toHaveBeenCalled();
  });

  it("shows 'Server timed out' state with Retry button on ClientQueueTimeoutError", async () => {
    const { ClientQueueTimeoutError } = await import("@/lib/api/api-client");
    mockUseWidgetQuery.mockReturnValue({
      isPending: false,
      fetchStatus: "idle",
      isError: true,
      error: new ClientQueueTimeoutError("timeout", 5000),
      data: undefined,
      missingParams: [],
      refetch: vi.fn(),
    });

    render(<CardContainer widget={makeWidget()} />);

    expect(screen.getByText("Server timed out")).toBeDefined();
    expect(screen.getByText(/waited too long in the queue/i)).toBeDefined();
    expect(screen.queryByText("Query Failed")).toBeNull();
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

  // ----- Empty rows (#1584) -----

  describe("zero rows", () => {
    it('shows "No data" when the query returns an empty row array', () => {
      mockUseWidgetQuery.mockReturnValue({
        isPending: false,
        fetchStatus: "idle",
        isError: false,
        data: { data: [], columns: [] },
        missingParams: [],
      });

      render(<CardContainer widget={makeWidget()} />);

      expect(screen.getByText("No data")).toBeDefined();
      expect(screen.queryByTestId("chart-renderer")).toBeNull();
    });

    it('shows "No data" when the editor preview has no rows', () => {
      mockUseWidgetQuery.mockReturnValue({
        isPending: false,
        fetchStatus: "idle",
        isError: false,
        data: null,
        missingParams: [],
      });

      render(<CardContainer widget={makeWidget()} previewData={[]} />);

      expect(screen.getByText("No data")).toBeDefined();
      expect(screen.queryByTestId("chart-renderer")).toBeNull();
    });

    it("never hands the plugin transform an empty array", () => {
      transformCalls.length = 0;
      mockUseWidgetQuery.mockReturnValue({
        isPending: false,
        fetchStatus: "idle",
        isError: false,
        data: { data: [], columns: [] },
        missingParams: [],
      });

      render(<CardContainer widget={makeWidget()} />);
      render(<CardContainer widget={makeWidget()} previewData={[]} />);

      expect(transformCalls).toEqual([]);
    });

    it("announces the empty state to assistive technology", () => {
      mockUseWidgetQuery.mockReturnValue({
        isPending: false,
        fetchStatus: "idle",
        isError: false,
        data: { data: [], columns: [] },
        missingParams: [],
      });

      render(<CardContainer widget={makeWidget()} />);

      // The canvas "No data" title the ECharts charts paint is invisible to a
      // screen reader; this state has to be real DOM in a live region.
      expect(screen.getByRole("status")).toBeDefined();
    });

    it("still renders a content widget that never had rows", () => {
      mockUseWidgetQuery.mockReturnValue({
        isPending: false,
        fetchStatus: "idle",
        isError: false,
        data: null,
        missingParams: [],
      });

      render(
        <CardContainer
          widget={makeWidget({ chartType: "markdown" })}
          previewData={[]}
        />,
      );

      expect(screen.queryByText("No data")).toBeNull();
    });
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

  it("shows truncation warning with the dynamic rowLimit when data is truncated", () => {
    mockUseWidgetQuery.mockReturnValue({
      isPending: false,
      fetchStatus: "idle",
      isError: false,
      data: {
        data: [{ name: "Alice", value: 10 }],
        resultId: "r1",
        truncated: true,
        rowLimit: 5000,
      },
      missingParams: [],
    });

    render(<CardContainer widget={makeWidget()} />);

    expect(screen.getByText(/Showing first 5,000 rows/)).toBeDefined();
  });

  it("reflects a custom per-connection rowLimit in the truncation warning", () => {
    mockUseWidgetQuery.mockReturnValue({
      isPending: false,
      fetchStatus: "idle",
      isError: false,
      data: {
        data: [{ name: "Alice", value: 10 }],
        resultId: "r1",
        truncated: true,
        rowLimit: 25000,
      },
      missingParams: [],
    });

    render(<CardContainer widget={makeWidget()} />);

    expect(screen.getByText(/Showing first 25,000 rows/)).toBeDefined();
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
        rowLimit: 5000,
      },
      missingParams: [],
    });

    render(<CardContainer widget={makeWidget()} />);

    expect(screen.queryByText(/Showing first .* rows/)).toBeNull();
  });

  // ----- Long-format rejection (#1400) -----

  describe("long-format results (#1400)", () => {
    const longFormat = [
      { category: "Apparel", series: "delivered", revenue: 100 },
      { category: "Apparel", series: "shipped", revenue: 50 },
      { category: "Home", series: "delivered", revenue: 80 },
    ];

    it("renders an explicit error state instead of a silently wrong chart", () => {
      mockUseWidgetQuery.mockReturnValue({
        isPending: false,
        fetchStatus: "idle",
        isError: false,
        data: { data: longFormat, resultId: "r1" },
        missingParams: [],
      });

      render(<CardContainer widget={makeWidget({ chartType: "bar" })} />);

      expect(screen.queryByTestId("chart-renderer")).toBeNull();
      expect(screen.getByText("Incompatible data format")).toBeDefined();
    });

    it("names the offending column in the error", () => {
      mockUseWidgetQuery.mockReturnValue({
        isPending: false,
        fetchStatus: "idle",
        isError: false,
        data: { data: longFormat, resultId: "r1" },
        missingParams: [],
      });

      render(<CardContainer widget={makeWidget({ chartType: "bar" })} />);

      expect(screen.getByText(/"series"/)).toBeDefined();
    });

    it("still renders the chart for the wide-format equivalent", () => {
      mockUseWidgetQuery.mockReturnValue({
        isPending: false,
        fetchStatus: "idle",
        isError: false,
        data: {
          data: [
            { category: "Apparel", delivered: 100, shipped: 50 },
            { category: "Home", delivered: 80, shipped: 20 },
          ],
          resultId: "r1",
        },
        missingParams: [],
      });

      render(<CardContainer widget={makeWidget({ chartType: "bar" })} />);

      expect(screen.getByTestId("chart-renderer")).toBeDefined();
    });
  });
});
