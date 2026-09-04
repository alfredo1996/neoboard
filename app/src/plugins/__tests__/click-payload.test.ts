import { describe, it, expect } from "vitest";
import { buildClickPayload } from "../utils";
import type { EChartsClickEvent } from "@neoboard/components";

/**
 * #1596 — ECharts flattens a tree with its synthesized virtual root first
 * (echarts/lib/data/Tree.js:304-323), so `data[dataIndex]` on the transformed
 * array is off by one for a treemap or sunburst: clicking one block fired the
 * action for its neighbour. Hierarchical series must read the datum ECharts
 * hands back instead.
 */

function ev(over: Partial<EChartsClickEvent>): EChartsClickEvent {
  return {
    componentType: "series",
    name: "",
    dataIndex: 0,
    data: undefined,
    value: undefined,
    ...over,
  } as EChartsClickEvent;
}

describe("buildClickPayload — hierarchical series (#1596)", () => {
  const rows = [
    { name: "Alpha", region: "EMEA", value: 10 },
    { name: "Beta", region: "APAC", value: 20 },
  ];

  it.each(["treemap", "sunburst"])(
    "%s reads the clicked datum, not the array position",
    (seriesType) => {
      // dataIndex 1 is Alpha once the virtual root occupies 0 — indexing the
      // transformed array would have returned Beta.
      const payload = buildClickPayload(
        ev({
          seriesType,
          dataIndex: 1,
          name: "Alpha",
          value: 10,
          data: { name: "Alpha", region: "EMEA", value: 10 },
          treePathInfo: [{ name: "" }, { name: "Alpha" }],
        } as Partial<EChartsClickEvent>),
        rows,
      );
      expect(payload).not.toBeNull();
      expect(payload!.region).toBe("EMEA");
      expect(payload!.name).toBe("Alpha");
    },
  );

  it("omits children so the payload stays a flat scalar bag", () => {
    const payload = buildClickPayload(
      ev({
        seriesType: "treemap",
        dataIndex: 1,
        name: "Alpha",
        data: { name: "Alpha", region: "EMEA", children: [{ name: "A-1" }] },
        treePathInfo: [{ name: "" }, { name: "Alpha" }],
      } as Partial<EChartsClickEvent>),
      rows,
    );
    expect(payload).not.toBeNull();
    expect("children" in payload!).toBe(false);
    expect(payload!.region).toBe("EMEA");
  });

  it("fires nothing for the virtual root", () => {
    const payload = buildClickPayload(
      ev({
        seriesType: "sunburst",
        dataIndex: 0,
        name: "",
        data: { name: "", children: [] },
        treePathInfo: [{ name: "" }],
      } as Partial<EChartsClickEvent>),
      rows,
    );
    expect(payload).toBeNull();
  });

  it("still fires for a real node whose name is empty because the query returned NULL", () => {
    // Verified against echarts 6.1.0: a NULL grouping column renders a real
    // clickable sector with name "". Testing `name === ""` would have silenced
    // it; only the virtual root has a treePathInfo of length <= 1.
    const payload = buildClickPayload(
      ev({
        seriesType: "sunburst",
        dataIndex: 4,
        name: "",
        value: 3,
        data: { name: "", region: "APAC", value: 3 },
        treePathInfo: [{ name: "" }, { name: "" }],
      } as Partial<EChartsClickEvent>),
      rows,
    );
    expect(payload).not.toBeNull();
    expect(payload!.region).toBe("APAC");
  });

  it("carries a sankey link's own endpoints", () => {
    // Sankey's transform output is { nodes, links } — not an array — so the
    // row lookup never merged anything for it.
    const payload = buildClickPayload(
      ev({
        seriesType: "sankey",
        dataIndex: 0,
        name: "Acme > Globex",
        value: 5,
        data: { source: "Acme", target: "Globex", value: 5 },
      }),
      { nodes: [], links: [] },
    );
    expect(payload).not.toBeNull();
    expect(payload!.source).toBe("Acme");
    expect(payload!.target).toBe("Globex");
  });
});

describe("buildClickPayload — row-indexed series are untouched", () => {
  it("keeps the row branch for a bar whose datum is an object from a styling rule", () => {
    // bar-chart.tsx emits { value, itemStyle } whenever a rule coloured the
    // bar. Keying the rule on "is data an object" instead of seriesType would
    // send bar down the datum branch and drop every raw column (#1589).
    const payload = buildClickPayload(
      ev({
        seriesType: "bar",
        dataIndex: 1,
        name: "b",
        value: 20,
        data: { value: 20, itemStyle: { color: "#f00" } },
      }),
      [
        { label: "a", properties: { genre: "rock" } },
        { label: "b", properties: { genre: "jazz" } },
      ],
    );
    expect(payload).not.toBeNull();
    expect(payload!.genre).toBe("jazz");
    expect(payload!.label).toBe("b");
    expect("itemStyle" in payload!).toBe(false);
  });

  it("keeps the row branch when a tree series hands back a non-object datum", () => {
    const payload = buildClickPayload(
      ev({ seriesType: "treemap", dataIndex: 1, name: "Beta", data: 20 }),
      rowsForFallback,
    );
    expect(payload).not.toBeNull();
    expect(payload!.region).toBe("APAC");
  });
});

const rowsForFallback = [
  { name: "Alpha", region: "EMEA" },
  { name: "Beta", region: "APAC" },
];
