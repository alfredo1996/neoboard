import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { barPlugin } from "../bar";
import { graphPlugin } from "../graph";
import { mapPlugin } from "../map";
import { gaugePlugin } from "../gauge";
import { linePlugin } from "../line";
import { piePlugin } from "../pie";
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
        data-decimal-places={String(props.decimalPlaces ?? "")}
        data-sampling-threshold={String(props.samplingThreshold ?? "")}
        data-sampling-method={String(props.samplingMethod ?? "")}
        data-marker-size={String(props.markerSize ?? "")}
        data-show-rel-labels={String(props.showRelationshipLabels ?? "")}
      />
    );
    Stub.displayName = "ChartStub";
    return Stub;
  },
}));

// The graph plugin wraps its chart in LazyVisible, which mounts children only
// once an IntersectionObserver reports the slot on screen — that never happens
// under jsdom, so the chart stub would never render.
vi.mock("@/components/lazy-visible", () => ({
  LazyVisible: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

vi.mock("@neoboard/components", () => ({
  Skeleton: () => null,
  getChartOptions: () => [],
}));

const GaugeComponent = gaugePlugin.component;
const BarComponent = barPlugin.component;
const LineComponent = linePlugin.component;
const PieComponent = piePlugin.component;
const GraphComponent = graphPlugin.component;
const MapComponent = mapPlugin.component;
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

describe("decimalPlaces forwarding on bar, line and pie (#1581)", () => {
  const cases = [
    ["bar", BarComponent],
    ["line", LineComponent],
    ["pie", PieComponent],
  ] as const;

  it.each(cases)("%s forwards the editor's value", (_type, Component) => {
    render(<Component data={[]} settings={{ decimalPlaces: 2 }} />);
    expect(
      screen.getByTestId("chart").getAttribute("data-decimal-places"),
    ).toBe("2");
  });

  it.each(cases)("%s coerces a stored string value", (_type, Component) => {
    // Imported dashboards and NeoDash conversions store numbers as strings.
    render(<Component data={[]} settings={{ decimalPlaces: "2" }} />);
    expect(
      screen.getByTestId("chart").getAttribute("data-decimal-places"),
    ).toBe("2");
  });

  it.each(cases)(
    "%s passes nothing when the option is unset",
    (_type, Component) => {
      render(<Component data={[]} settings={{}} />);
      expect(
        screen.getByTestId("chart").getAttribute("data-decimal-places"),
      ).toBe("");
    },
  );
});

describe("options advertised by the editor reach the chart (#1472)", () => {
  const attr = (name: string) => screen.getByTestId("chart").getAttribute(name);

  it("line forwards both sampling controls", () => {
    // They only work as a pair: the method is read solely when the threshold
    // is exceeded (line-chart.tsx:160-161).
    render(
      <LineComponent
        data={[]}
        settings={{ samplingThreshold: 500, samplingMethod: "average" }}
      />,
    );
    expect(attr("data-sampling-threshold")).toBe("500");
    expect(attr("data-sampling-method")).toBe("average");
  });

  it("line keeps the chart's own sampling defaults when unset", () => {
    render(<LineComponent data={[]} settings={{}} />);
    expect(attr("data-sampling-threshold")).toBe("1000");
    expect(attr("data-sampling-method")).toBe("lttb");
  });

  it("map forwards markerSize", () => {
    render(<MapComponent data={[]} settings={{ markerSize: 14 }} />);
    expect(attr("data-marker-size")).toBe("14");
  });

  it("graph forwards showRelationshipLabels", () => {
    render(
      <GraphComponent
        data={{ nodes: [], edges: [] }}
        settings={{ showRelationshipLabels: false }}
      />,
    );
    expect(attr("data-show-rel-labels")).toBe("false");
  });
});
