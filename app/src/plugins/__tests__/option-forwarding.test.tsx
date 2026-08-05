import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { gaugePlugin } from "../gauge";
import { singleValuePlugin } from "../single-value";
import { transformToValueData } from "../single-value/transform";

/**
 * #1397 — `thresholdZones` and `trendEnabled` were advertised in the widget
 * editor, implemented in the component library, and never handed from the
 * plugin to the chart. These assert the exact seam that was broken: the props
 * the plugin actually passes.
 */

vi.mock("next/dynamic", () => ({
  default: () => {
    const Stub = (props: Record<string, unknown>) => (
      <div
        data-testid="chart"
        data-threshold-zones={String(props.thresholdZones ?? "")}
        data-trend-direction={
          (props.trend as { direction?: string } | undefined)?.direction ?? ""
        }
        data-trend-label={
          (props.trend as { label?: string } | undefined)?.label ?? ""
        }
        data-value={String(props.value ?? "")}
      />
    );
    Stub.displayName = "ChartStub";
    return Stub;
  },
}));

vi.mock("@neoboard/components", () => ({
  Skeleton: () => null,
  getChartOptions: () => [],
}));

const GaugeComponent = gaugePlugin.component;
const SingleValueComponent = singleValuePlugin.component;

describe("gauge thresholdZones forwarding (#1397)", () => {
  const zones =
    '[{"value":30,"color":"#ef4444"},{"value":100,"color":"#22c55e"}]';

  it("passes thresholdZones through to the chart", () => {
    render(<GaugeComponent data={[]} settings={{ thresholdZones: zones }} />);
    expect(
      screen.getByTestId("chart").getAttribute("data-threshold-zones"),
    ).toBe(zones);
  });

  it("passes nothing when the option is unset", () => {
    render(<GaugeComponent data={[]} settings={{}} />);
    expect(
      screen.getByTestId("chart").getAttribute("data-threshold-zones"),
    ).toBe("");
  });
});

describe("single-value trendEnabled forwarding (#1397)", () => {
  /** The shape the editor's own instruction produces: two rows, label + value. */
  const twoRows = [
    { label: "2026-03", value: 100 },
    { label: "2026-02", value: 80 },
  ];

  it("renders an upward trend when enabled and a previous row exists", () => {
    render(
      <SingleValueComponent
        data={transformToValueData(twoRows)}
        settings={{ trendEnabled: true }}
      />,
    );
    const el = screen.getByTestId("chart");
    expect(el.getAttribute("data-trend-direction")).toBe("up");
    expect(el.getAttribute("data-trend-label")).toBe("25.0%");
  });

  it("renders a downward trend when the value fell", () => {
    render(
      <SingleValueComponent
        data={transformToValueData([...twoRows].reverse())}
        settings={{ trendEnabled: true }}
      />,
    );
    expect(
      screen.getByTestId("chart").getAttribute("data-trend-direction"),
    ).toBe("down");
  });

  it("renders no trend when the option is off", () => {
    render(
      <SingleValueComponent
        data={transformToValueData(twoRows)}
        settings={{ trendEnabled: false }}
      />,
    );
    expect(
      screen.getByTestId("chart").getAttribute("data-trend-direction"),
    ).toBe("");
  });

  it("renders no trend when there is only one row to compare", () => {
    render(
      <SingleValueComponent
        data={transformToValueData([{ label: "2026-03", value: 100 }])}
        settings={{ trendEnabled: true }}
      />,
    );
    expect(
      screen.getByTestId("chart").getAttribute("data-trend-direction"),
    ).toBe("");
  });

  // The headline symptom of #1397: following the editor's "requires 2 rows"
  // instruction rendered the date column as the KPI, e.g. `$2026-03`.
  it("shows the numeric column as the headline value, not the label", () => {
    render(
      <SingleValueComponent
        data={transformToValueData(twoRows)}
        settings={{ trendEnabled: true }}
      />,
    );
    expect(screen.getByTestId("chart").getAttribute("data-value")).toBe("100");
  });
});
