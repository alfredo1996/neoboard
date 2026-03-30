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
}));

// Mock next/dynamic to just render children synchronously
vi.mock("next/dynamic", () => ({
  default: () => {
    return function DynamicStub() {
      return <div data-testid="dynamic-stub" />;
    };
  },
}));

vi.mock("@/lib/normalize-value", () => ({
  normalizeValue: (v: unknown) => v,
}));
vi.mock("@/components/parameter-widget-renderer", () => ({
  ParameterWidgetRenderer: () => <div data-testid="param-renderer" />,
}));
vi.mock("@/components/graph-exploration-wrapper", () => ({
  GraphExplorationWrapper: () => <div data-testid="graph-wrapper" />,
}));
vi.mock("@/components/form-widget-renderer", () => ({
  FormWidgetRenderer: () => <div data-testid="form-renderer" />,
}));

// Suppress console.error from the error boundary during tests
const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});

import { ChartRenderer } from "../chart-renderer";

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
