import { describe, it, expect, vi, afterAll } from "vitest";
import { render, screen } from "@testing-library/react";
import React from "react";
import { ChartErrorBoundary } from "../chart-error-boundary";

const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});

function ThrowingChild(): React.JSX.Element {
  throw new Error("test explosion");
}

function GoodChild() {
  return <div data-testid="good-child">OK</div>;
}

describe("ChartErrorBoundary", () => {
  afterAll(() => consoleError.mockRestore());

  it("renders children when no error", () => {
    render(
      <ChartErrorBoundary chartType="bar">
        <GoodChild />
      </ChartErrorBoundary>,
    );
    expect(screen.getByTestId("good-child")).toBeDefined();
  });

  it("renders fallback UI when child throws", () => {
    render(
      <ChartErrorBoundary chartType="pie">
        <ThrowingChild />
      </ChartErrorBoundary>,
    );
    expect(screen.getByText("Chart failed to render")).toBeDefined();
    expect(screen.getByText("test explosion")).toBeDefined();
  });

  it("logs error with chart type", () => {
    render(
      <ChartErrorBoundary chartType="sankey">
        <ThrowingChild />
      </ChartErrorBoundary>,
    );
    expect(consoleError).toHaveBeenCalledWith(
      expect.stringContaining("[ChartErrorBoundary] sankey crashed:"),
      expect.any(Error),
      expect.anything(),
    );
  });
});
