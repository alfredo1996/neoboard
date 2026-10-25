import { act, render, screen } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, type Mock } from "vitest";
import * as echarts from "echarts/core";
import { SunburstChart } from "../sunburst-chart";

// echarts/charts, echarts/components, echarts/renderers are mocked globally
// in vitest.setup.ts. Only echarts/core is mocked here to capture setOption.
const mockSetOption = vi.fn();
const mockOn = vi.fn();

vi.mock("echarts/core", () => {
  const use = vi.fn();
  const init = vi.fn(() => ({
    setOption: mockSetOption,
    resize: vi.fn(),
    dispose: vi.fn(),
    on: mockOn,
    off: vi.fn(),
    showLoading: vi.fn(),
    hideLoading: vi.fn(),
  }));
  const registerTheme = vi.fn();
  return { use, init, registerTheme, default: { use, init, registerTheme } };
});

const sampleData = [
  {
    name: "Root",
    value: 100,
    children: [
      { name: "A", value: 40 },
      { name: "B", value: 60 },
    ],
  },
];

const flatData = [
  { name: "X", value: 30 },
  { name: "Y", value: 70 },
];

const catalogue = [
  {
    name: "Home",
    children: [
      {
        name: "Furniture",
        children: [
          { name: "Desk", value: 5 },
          { name: "Chair", value: 3 },
        ],
      },
      { name: "Decor", children: [{ name: "Rug", value: 2 }] },
    ],
  },
  { name: "Audio", children: [{ name: "Headphones", value: 4 }] },
];

type Node = { name: string; children?: Node[] };
const depthOf = (nodes: Node[]): number =>
  nodes.length
    ? 1 + Math.max(0, ...nodes.map((n) => depthOf(n.children ?? [])))
    : 0;
const lastOption = () => mockSetOption.mock.calls.at(-1)![0];
const clickHandler = () =>
  mockOn.mock.calls.filter((c) => c[0] === "click").at(-1)![1] as (
    e: unknown,
  ) => void;
const click = (...path: string[]) =>
  act(() =>
    clickHandler()({
      componentType: "series",
      treePathInfo: [{ name: "" }, ...path.map((name) => ({ name }))],
    }),
  );

describe("SunburstChart", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders without errors", () => {
    render(<SunburstChart data={sampleData} />);
    expect(screen.getByTestId("base-chart")).toBeInTheDocument();
  });

  it("handles empty data with a No data title", () => {
    render(<SunburstChart data={[]} />);
    const optionsCall = mockSetOption.mock.calls[0][0];
    expect(optionsCall.title.text).toBe("No data");
  });

  it("sets sunburst type on series", () => {
    render(<SunburstChart data={sampleData} />);
    const optionsCall = mockSetOption.mock.calls[0][0];
    expect(optionsCall.series[0].type).toBe("sunburst");
  });

  it("omits the emphasis block when highlightOnHover is disabled", () => {
    render(<SunburstChart data={sampleData} highlightOnHover={false} />);
    const series = mockSetOption.mock.calls[0][0].series[0];
    expect(series.emphasis).toEqual({});
  });

  it("shows loading state", () => {
    render(<SunburstChart data={sampleData} loading />);
    expect(screen.getByTestId("base-chart")).toBeInTheDocument();
  });

  it("shows error state", () => {
    render(<SunburstChart data={sampleData} error={new Error("Fail")} />);
    expect(screen.getByRole("alert")).toHaveTextContent("Fail");
  });

  // --- styling rules ---

  it("applies styling rule color to flat items that match rule", () => {
    const stylingRules = [
      { id: "r1", operator: ">=" as const, value: 50, color: "#ff0000" },
    ];
    render(<SunburstChart data={flatData} stylingRules={stylingRules} />);
    const optionsCall = mockSetOption.mock.calls[0][0];
    const seriesData = optionsCall.series[0].data;
    // Y has value 70 which is >= 50
    const itemY = seriesData.find((d: { name: string }) => d.name === "Y");
    expect(itemY?.itemStyle?.color).toBe("#ff0000");
  });

  it("does not apply color when value does not match styling rule", () => {
    const stylingRules = [
      { id: "r1", operator: ">=" as const, value: 50, color: "#ff0000" },
    ];
    render(<SunburstChart data={flatData} stylingRules={stylingRules} />);
    const optionsCall = mockSetOption.mock.calls[0][0];
    const seriesData = optionsCall.series[0].data;
    // X has value 30 which is < 50
    const itemX = seriesData.find((d: { name: string }) => d.name === "X");
    expect(itemX?.itemStyle?.color).toBe("#C47C08"); // the palette, not the rule
  });

  it("keeps each item's name and value when it paints them", () => {
    render(<SunburstChart data={flatData} />);
    const data = mockSetOption.mock.calls[0][0].series[0].data;
    expect(
      data.map((d: { name: string; value: number }) => [d.name, d.value]),
    ).toEqual([
      ["X", 30],
      ["Y", 70],
    ]);
  });

  it("accepts paramValues prop without error", () => {
    const stylingRules = [
      { id: "r1", operator: ">=" as const, value: 30, color: "#00ff00" },
    ];
    const paramValues = { threshold: 30 };
    render(
      <SunburstChart
        data={flatData}
        stylingRules={stylingRules}
        paramValues={paramValues}
      />,
    );
    expect(screen.getByTestId("base-chart")).toBeInTheDocument();
  });

  describe("native drill vs a configured click action (#1596)", () => {
    it("drills by its own state, not ECharts' root-to-node, with no click action", () => {
      render(<SunburstChart data={sampleData} />);
      const option = mockSetOption.mock.calls[0][0];
      expect(option.series[0].nodeClick).toBe(false);
    });

    it("suppresses native drill when a click action is configured", () => {
      // Otherwise one click both fires the action and moves the view.
      render(<SunburstChart data={sampleData} onClick={() => {}} />);
      const option = mockSetOption.mock.calls[0][0];
      expect(option.series[0].nodeClick).toBe(false);
    });
  });

  describe("lone root and thin slices (#1592-adjacent, W2-02)", () => {
    it("draws a lone root's children as the rings, not the root itself", () => {
      // The transform keeps the wrapper because circle packing needs its name
      // as a breadcrumb; showing it here would paint every arc as tints of one
      // hue.
      render(
        <SunburstChart
          data={[
            {
              name: "All",
              children: [
                { name: "Drama", value: 3 },
                { name: "Comedy", value: 2 },
              ],
            },
          ]}
        />,
      );
      const option = mockSetOption.mock.calls[0][0];
      expect(
        option.series[0].data.map((d: { name: string }) => d.name),
      ).toEqual(["Drama", "Comedy"]);
    });

    it("counts the drawn rings in the screen-reader description", () => {
      render(
        <SunburstChart
          data={[
            {
              name: "All",
              children: [
                { name: "Drama", value: 3 },
                { name: "Comedy", value: 2 },
              ],
            },
          ]}
        />,
      );
      expect(
        screen.getByLabelText(/2 top-level segments/i),
      ).toBeInTheDocument();
    });

    it("no longer inflates thin slices to a 5-degree minimum", () => {
      // minAngle: 5 made anything under ~1.4% of the total look larger than it
      // is, and enough of them wrapped the ring past 360 degrees.
      render(<SunburstChart data={sampleData} />);
      const option = mockSetOption.mock.calls[0][0];
      expect(option.series[0].minAngle).toBeUndefined();
    });
  });

  describe("rings and drill (#2231)", () => {
    it("draws two rings first when there is no click action", () => {
      render(<SunburstChart data={catalogue} />);
      expect(depthOf(lastOption().series[0].data)).toBe(2);
    });

    it("sizes the two-ring overview's arcs from leaf values", () => {
      render(<SunburstChart data={catalogue} />);
      const home = lastOption().series[0].data[0];
      expect(home.children.map((c: { value: number }) => c.value)).toEqual([
        8, 2,
      ]);
    });

    it("drills after a refresh dropped the node it was drilled into", () => {
      const toys = { name: "Toys", children: [{ name: "Lego", value: 1 }] };
      const { rerender } = render(
        <SunburstChart data={[...catalogue, toys]} />,
      );
      click("Home");
      rerender(<SunburstChart data={[catalogue[1], toys]} />);
      click("Audio");
      expect(lastOption().series[0].data.map((d: Node) => d.name)).toEqual([
        "Headphones",
      ]);
    });

    it("draws every ring when a click action is configured", () => {
      render(<SunburstChart data={catalogue} onClick={() => {}} />);
      expect(depthOf(lastOption().series[0].data)).toBe(3);
    });

    it("hands the click to the action and never drills when one is configured", () => {
      const onClick = vi.fn();
      render(<SunburstChart data={catalogue} onClick={onClick} />);
      click("Home");
      expect(onClick).toHaveBeenCalledTimes(1);
      expect(lastOption().series[0].data.map((d: Node) => d.name)).toEqual([
        "Home",
        "Audio",
      ]);
    });

    it("a click goes one level down, and the centre one level up", () => {
      render(<SunburstChart data={catalogue} />);
      const names = () => lastOption().series[0].data.map((d: Node) => d.name);

      click("Home");
      expect(names()).toEqual(["Furniture", "Decor"]);
      expect(depthOf(lastOption().series[0].data)).toBe(2);

      click("Furniture");
      expect(names()).toEqual(["Desk", "Chair"]);

      // A product has nowhere to go.
      click("Desk");
      expect(names()).toEqual(["Desk", "Chair"]);

      const [, centre] = lastOption().graphic;
      expect(centre.onclick).toBeTypeOf("function");
      act(() => centre.onclick());
      expect(names()).toEqual(["Furniture", "Decor"]);
      act(() => lastOption().graphic[1].onclick());
      expect(names()).toEqual(["Home", "Audio"]);
    });

    it("starts a fresh chart instance per view, so no blur outlives a drill", () => {
      render(<SunburstChart data={catalogue} />);
      const inits = () => (vi.mocked(echarts.init) as Mock).mock.calls.length;
      const before = inits();
      click("Home");
      expect(inits()).toBe(before + 1);
    });

    it("the centre shows the total and what it counts, and goes inert at the top", () => {
      render(<SunburstChart data={catalogue} valueLabel="revenue" />);
      const [text, hit] = lastOption().graphic;
      expect(text.style.text).toBe("{a|14}\n{b|revenue}");
      expect(hit.silent).toBe(true);
      click("Home");
      expect(lastOption().graphic[0].style.text).toBe(
        "{n|Home}\n{a|10}\n{c|← back}",
      );
      expect(lastOption().graphic[1].silent).toBe(false);
    });

    it("keeps a click-action chart's centre as a plain total", () => {
      render(<SunburstChart data={catalogue} onClick={() => {}} />);
      expect(lastOption().graphic[1].silent).toBe(true);
    });
  });

  describe("labels and colours (#2231)", () => {
    it("lays labels level and hides them where they do not fit", () => {
      render(<SunburstChart data={catalogue} />);
      const levels = lastOption().series[0].levels;
      expect(levels[1].label.rotate).toBe(0);
      expect(levels[2].label.rotate).toBe(0);
      expect(levels[2].label.minAngle).toBeGreaterThan(0);
    });

    it("gives each segment ink or white by contrast, never the shared white", () => {
      render(<SunburstChart data={catalogue} />);
      const [home] = lastOption().series[0].data;
      // Light-theme citrine takes ink.
      expect(home.itemStyle.color).toBe("#C47C08");
      expect(home.label.color).toBe("#16181D");
    });

    it("hides the labels of rings beyond maxLabelDepth", () => {
      render(
        <SunburstChart data={catalogue} onClick={() => {}} maxLabelDepth={1} />,
      );
      const levels = lastOption().series[0].levels;
      expect(levels[1].label.show).not.toBe(false);
      expect(levels[2].label.show).toBe(false);
      expect(levels[3].label.show).toBe(false);
    });
  });
});
