import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { barPlugin } from "../bar";

vi.mock("next/dynamic", () => ({
  default: () => {
    const Stub = (props: Record<string, unknown>) => (
      <div
        data-testid="bar-chart"
        data-stacked={String(props.stacked ?? false)}
        data-orientation={String(props.orientation ?? "vertical")}
      />
    );
    Stub.displayName = "BarChartStub";
    return Stub;
  },
}));

vi.mock("@neoboard/components", () => ({
  Skeleton: () => null,
}));

describe("barPlugin", () => {
  it("declares type = 'bar'", () => {
    expect(barPlugin.type).toBe("bar");
  });

  it("supports click action and styling", () => {
    expect(barPlugin.capabilities.supportsClickAction).toBe(true);
    expect(barPlugin.capabilities.supportsStyling).toBe(true);
    expect(barPlugin.capabilities.isECharts).toBe(true);
    expect(barPlugin.capabilities.requiresQuery).toBe(true);
  });

  it("compatible with neo4j and postgresql", () => {
    expect(barPlugin.compatibleWith).toEqual(["neo4j", "postgresql"]);
  });

  it("has a styling target for bar color", () => {
    expect(barPlugin.stylingTargets).toEqual([
      { value: "color", label: "Bar Color" },
    ]);
  });

  it("renders BarChart with settings passed through", () => {
    const Component = barPlugin.component;
    render(
      <Component
        data={[]}
        settings={{ stacked: true, orientation: "horizontal" }}
      />,
    );
    const chart = screen.getByTestId("bar-chart");
    expect(chart).toHaveAttribute("data-stacked", "true");
    expect(chart).toHaveAttribute("data-orientation", "horizontal");
  });

  it("has transform and validate from chart registry", () => {
    expect(typeof barPlugin.transform).toBe("function");
    expect(typeof barPlugin.validate).toBe("function");
  });
});
