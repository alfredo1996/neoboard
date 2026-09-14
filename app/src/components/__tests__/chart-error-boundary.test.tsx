import { describe, it, expect, vi, afterAll } from "vitest";
import { render, screen } from "@testing-library/react";
import React from "react";

// Mock @neoboard/components to avoid pulling in ECharts
vi.mock("@neoboard/components", () => ({
  Skeleton: ({ className }: { className?: string }) => (
    <div data-testid="skeleton" className={className} />
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
  JsonViewer: () => <div data-testid="json-viewer" />,
  MarkdownWidget: () => <div data-testid="markdown-widget" />,
  IframeWidget: () => <div data-testid="iframe-widget" />,
  getChartOptions: () => [],
}));

// Mock next/dynamic to just render children synchronously
vi.mock("next/dynamic", () => ({
  default: () => {
    return function DynamicStub() {
      return <div data-testid="dynamic-stub" />;
    };
  },
}));

vi.mock("@/lib/shared/normalize-value", () => ({
  normalizeValue: (v: unknown) => v,
}));
/** The props each real plugin last handed the renderer that sends its requests. */
const rendererProps = vi.hoisted(
  () => ({}) as Record<"selector" | "graph" | "form", Record<string, unknown>>,
);
vi.mock("@/components/parameter-widget-renderer", () => ({
  ParameterWidgetRenderer: (p: Record<string, unknown>) => {
    rendererProps.selector = p;
    return <div data-testid="param-renderer" />;
  },
}));
vi.mock("@/components/graph-exploration-wrapper", () => ({
  GraphExplorationWrapper: (p: Record<string, unknown>) => {
    rendererProps.graph = p;
    return <div data-testid="graph-wrapper" />;
  },
}));
vi.mock("@/components/form-widget-renderer", () => ({
  FormWidgetRenderer: (p: Record<string, unknown>) => {
    rendererProps.form = p;
    return <div data-testid="form-renderer" />;
  },
}));
// The setup file's IntersectionObserver never reports, so the graph plugin's
// lazy mount would never happen.
vi.mock("@/components/lazy-visible", () => ({
  LazyVisible: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

// Suppress console.error from the error boundary during tests
const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});

import { ChartRenderer } from "../chart-renderer";
import { pluginRegistry } from "@/plugins";

/** Put a plugin in the real registry so ChartRenderer resolves it. */
function registerStubPlugin(
  type: string,
  component: (props: Record<string, unknown>) => React.ReactElement,
) {
  if (pluginRegistry.has(type)) pluginRegistry.unregister(type);
  pluginRegistry.register({
    type,
    label: type,
    component: component as never,
    transform: (d: unknown) => d,
    options: [],
    capabilities: {
      supportsClickAction: true,
      supportsStyling: true,
      isECharts: false,
      requiresQuery: true,
    },
  } as never);
}

/**
 * The 13-prop bridge from ChartRenderer to every plugin (#1629).
 *
 * Every rule-based colour, every dashboard parameter substitution and every
 * click action reaches a chart through this one JSX block. It executes on
 * every render — in the app and in these tests — so the file reported as
 * covered while the only thing either of the two byte-identical test files
 * here proved was that a JsonViewer element appeared.
 */
describe("ChartRenderer plugin props", () => {
  it("hands every prop through to the plugin component", () => {
    const seen: Record<string, unknown>[] = [];
    registerStubPlugin("propspy", (props: Record<string, unknown>) => {
      seen.push(props);
      return <div data-testid="propspy" />;
    });

    // The four groups the renderer unpacks: styling, interaction, meta and
    // the top-level data/settings.
    const rules = [
      { id: "r", operator: ">" as const, value: 1, color: "#fff" },
    ];
    const paramValues = { region: "EU" };
    const colorScales = [{ column: "a", minColor: "#000", maxColor: "#fff" }];
    const onChartClick = () => {};
    const clickableColumns = ["a"];
    const data = [{ a: 1 }];
    const settings = {
      title: "T",
      colorThresholds: [{ value: 1, color: "#f00" }],
    };

    render(
      <ChartRenderer
        type="propspy"
        data={data}
        settings={settings}
        styling={{ rules, paramValues, colorScales } as never}
        interaction={{ onChartClick, clickableColumns }}
        meta={{
          connectionId: "conn-1",
          widgetId: "w-1",
          resultId: "res-1",
          query: "SELECT 1",
          database: "neoboard",
          autoFit: true,
        }}
      />,
    );

    const expected: Record<string, unknown> = {
      data,
      settings,
      stylingRules: rules,
      paramValues,
      colorScales,
      onChartClick,
      clickableColumns,
      connectionId: "conn-1",
      widgetId: "w-1",
      resultId: "res-1",
      query: "SELECT 1",
      database: "neoboard",
      autoFit: true,
    };

    expect(screen.getByTestId("propspy")).toBeInTheDocument();
    expect(seen).toHaveLength(1);
    // Named one by one rather than toMatchObject: a prop the bridge drops must
    // fail here, and a missing key in a partial match does not.
    for (const [key, value] of Object.entries(expected)) {
      expect(seen[0][key], `prop "${key}" never reached the plugin`).toBe(
        value,
      );
    }
  });
});

/**
 * #1824 — a selector's options, a form's submit and field options, and a
 * graph's node expansion run on the database their widget saves. These are the
 * real plugins, so a plugin that drops the database fails here.
 */
describe("ChartRenderer — the saved database reaches each request builder (#1824)", () => {
  it("hands the database to the selector, form and graph renderers, and the form its stored id", () => {
    render(
      <ChartRenderer
        type="parameter-select"
        data={null}
        settings={{
          parameterName: "db",
          parameterType: "select",
          seedQuery: "SELECT 1",
        }}
        meta={{
          connectionId: "c1",
          widgetId: "w-select",
          database: "neoboard",
        }}
      />,
    );
    render(
      <ChartRenderer
        type="form"
        data={null}
        settings={{ formFields: [] }}
        meta={{
          connectionId: "c1",
          widgetId: "w-form",
          query: "CREATE (n)",
          database: "neoboard",
        }}
      />,
    );
    render(
      <ChartRenderer
        type="graph"
        data={{ nodes: [], edges: [] }}
        settings={{}}
        meta={{
          connectionId: "c1",
          widgetId: "w-graph",
          resultId: "r1",
          database: "neoboard",
        }}
      />,
    );

    expect(rendererProps.selector).toMatchObject({
      connectionId: "c1",
      seedQuery: "SELECT 1",
      database: "neoboard",
    });
    expect(rendererProps.form).toMatchObject({
      connectionId: "c1",
      widgetId: "w-form",
      database: "neoboard",
    });
    expect(rendererProps.graph).toMatchObject({
      connectionId: "c1",
      database: "neoboard",
    });
  });
});

describe("ChartRenderer error boundary", () => {
  afterAll(() => {
    consoleError.mockRestore();
  });

  it("renders fallback when a chart throws during render", () => {
    // Force a render error by passing data that will cause JSON.stringify to throw
    const circular: Record<string, unknown> = {};
    circular.self = circular;

    // The table renderer will try to process this — but we need something
    // that actually throws. Let's use a getter that throws.
    const badData = [
      new Proxy(
        {},
        {
          get() {
            throw new Error("Boom!");
          },
          ownKeys() {
            throw new Error("Boom!");
          },
        },
      ),
    ];

    render(
      <ChartRenderer
        type={"table" as Parameters<typeof ChartRenderer>[0]["type"]}
        data={badData}
      />,
    );

    expect(screen.getByText("Chart failed to render")).toBeDefined();
    expect(screen.getByText("Boom!")).toBeDefined();
  });

  it("renders chart normally when no error occurs", () => {
    render(
      <ChartRenderer
        type={"json" as Parameters<typeof ChartRenderer>[0]["type"]}
        data={{ hello: "world" }}
      />,
    );

    // JSON viewer should render (mocked)
    expect(screen.getByTestId("json-viewer")).toBeDefined();
  });

  it("renders unknown chart type as empty state (not error boundary)", () => {
    render(
      <ChartRenderer
        type={"nonexistent" as Parameters<typeof ChartRenderer>[0]["type"]}
        data={null}
      />,
    );

    expect(screen.getByText("Unknown chart type")).toBeDefined();
  });
});
