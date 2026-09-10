import { describe, it, expect } from "vitest";
import { buildClickPayload } from "../utils";
import type { EChartsClickEvent } from "@neoboard/components";
import { transformToBarData } from "../bar/transform";
import { transformToLineData } from "../line/transform";
import { transformToPieData } from "../pie/transform";
import { transformToSankeyData } from "../sankey/transform";
import { transformToGanttData } from "../gantt/transform";
import { resolveClickActions } from "@/lib/widget/resolve-click-action";
import type { DashboardWidget } from "@/lib/db/schema";

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

  it.each(["sunburst"])(
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
        seriesType: "sunburst",
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
  it("no longer treats treemap as a datum series (#1687)", () => {
    // The app dropped its treemap plugin, so an ECharts treemap click can
    // only come from an external plugin — which gets the generic row path.
    const payload = buildClickPayload(
      ev({
        seriesType: "treemap",
        dataIndex: 1,
        name: "Alpha",
        data: { name: "Alpha", region: "EMEA" },
        treePathInfo: [{ name: "" }, { name: "Alpha" }],
      } as Partial<EChartsClickEvent>),
      [
        { name: "Alpha", region: "EMEA" },
        { name: "Beta", region: "APAC" },
      ],
    );
    expect(payload!.region).toBe("APAC");
  });

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
      ev({ seriesType: "sunburst", dataIndex: 1, name: "Beta", data: 20 }),
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

/** A widget whose one click rule sets `p` from `sourceField`. */
function widgetWithSourceField(sourceField: string): DashboardWidget {
  return {
    id: "w",
    chartType: "bar",
    settings: {
      clickAction: {
        type: "set-parameter",
        rules: [
          {
            id: "r",
            type: "set-parameter",
            parameterMapping: { parameterName: "p", sourceField },
          },
        ],
      },
    },
  } as unknown as DashboardWidget;
}

const resolvedValue = (
  payload: Record<string, unknown> | null,
  sourceField: string,
) =>
  payload
    ? resolveClickActions(widgetWithSourceField(sourceField), payload)
        ?.setParameter?.value
    : undefined;

/**
 * #1597 — the editor offers raw query columns by name, so a payload key that
 * names a query column must carry that column. The event's own `value` (and
 * the transform's derived fields) used to be written last and overwrote it.
 */
describe("buildClickPayload — a query column wins over a derived field of the same name (#1597)", () => {
  it("gantt: a column named value is not overwritten by the custom-series tuple", () => {
    const data = transformToGanttData([
      { task: "Design", start: "2026-01-01", end: "2026-01-02", value: 42 },
    ]);
    // gantt-chart.tsx hands ECharts a 6-element tuple as each item's value.
    const payload = buildClickPayload(
      ev({
        seriesType: "custom",
        dataIndex: 0,
        name: "Design",
        value: [0, 1, 2, 1, "", 0],
      } as unknown as Partial<EChartsClickEvent>),
      data,
    );
    expect(payload!.value).toBe(42);
    expect(resolvedValue(payload, "value")).toBe(42);
  });

  it("bar: a category column named value beats the clicked bar's number", () => {
    const data = transformToBarData([{ value: "Keanu Reeves", films: 7 }]);
    const payload = buildClickPayload(
      ev({
        seriesType: "bar",
        dataIndex: 0,
        name: "Keanu Reeves",
        value: 7,
        seriesName: "films",
        data: 7,
      } as Partial<EChartsClickEvent>),
      data,
    );
    expect(resolvedValue(payload, "value")).toBe("Keanu Reeves");
  });

  it("pie: a column named value beats the slice size the transform took from another column", () => {
    // pie's value is the first non-name column (`total`), not `value`.
    const data = transformToPieData([
      { status: "open", total: 3, value: "v-open" },
    ]) as Record<string, unknown>[];
    const payload = buildClickPayload(
      ev({
        seriesType: "pie",
        dataIndex: 0,
        name: "open",
        value: 3,
        data: data[0],
      } as Partial<EChartsClickEvent>),
      data,
    );
    expect(resolvedValue(payload, "value")).toBe("v-open");
  });

  it("Movie Highlights: name/value columns still set the clicked actor", () => {
    const data = transformToBarData([
      { name: "Keanu Reeves", value: 7 },
      { name: "Tom Hanks", value: 12 },
    ]);
    const payload = buildClickPayload(
      ev({
        seriesType: "bar",
        dataIndex: 1,
        name: "Tom Hanks",
        value: 12,
        seriesName: "value",
        data: 12,
      } as Partial<EChartsClickEvent>),
      data,
    );
    expect(resolvedValue(payload, "name")).toBe("Tom Hanks");
    expect(payload!.value).toBe(12);
  });

  it("names the query does not have still come from the transform and the event", () => {
    const data = transformToBarData([{ genre: "rock", films: 3 }]);
    const payload = buildClickPayload(
      ev({
        seriesType: "bar",
        dataIndex: 0,
        name: "rock",
        value: 3,
        seriesName: "films",
        data: 3,
      } as Partial<EChartsClickEvent>),
      data,
    );
    expect(payload).toMatchObject({
      label: "rock",
      name: "rock",
      value: 3,
      seriesName: "films",
      dataIndex: 0,
    });
  });
});

/**
 * #1598 — bar, line, pie and sankey rebuilt their items from renamed fields
 * and kept no raw row, so every Source Field the editor offered for them
 * resolved to undefined and the action died in silence.
 */
describe("buildClickPayload — every offered raw column resolves (#1598)", () => {
  const pieData = transformToPieData([
    { status: "open", total: 3 },
    { status: "closed", total: 9 },
  ]) as Record<string, unknown>[];
  const sankeyData = transformToSankeyData([
    { src: "A", dst: "A", amount: 1 },
    { src: "A", dst: "B", amount: 5 },
  ]) as { links: Record<string, unknown>[] };

  const cases = [
    {
      chart: "bar",
      data: transformToBarData([
        { genre: "rock", films: 3 },
        { genre: "jazz", films: 5 },
      ]),
      event: {
        seriesType: "bar",
        dataIndex: 1,
        name: "jazz",
        value: 5,
        seriesName: "films",
        data: 5,
      },
      sourceField: "genre",
      expected: "jazz",
    },
    {
      chart: "line",
      data: transformToLineData([
        { month: "Jan", revenue: 1 },
        { month: "Feb", revenue: 2 },
      ]),
      event: {
        seriesType: "line",
        dataIndex: 1,
        name: "Feb",
        value: 2,
        seriesName: "revenue",
        data: 2,
      },
      sourceField: "month",
      expected: "Feb",
    },
    {
      // sortSlices/topN reorder slices inside pie-chart.tsx, so ECharts'
      // dataIndex 0 here is row 1 of the transform output — only the datum
      // ECharts hands back (styling rules spread an itemStyle onto it) knows.
      chart: "pie",
      data: pieData,
      event: {
        seriesType: "pie",
        dataIndex: 0,
        name: "closed",
        value: 9,
        data: { ...pieData[1], itemStyle: { color: "#f00" } },
      },
      sourceField: "status",
      expected: "closed",
    },
    {
      // The self-loop row is dropped, so link 0 comes from row 1.
      chart: "sankey",
      data: sankeyData,
      event: {
        seriesType: "sankey",
        dataIndex: 0,
        name: "A > B",
        value: 5,
        data: sankeyData.links[0],
      },
      sourceField: "dst",
      expected: "B",
    },
  ];

  it.each(cases)(
    "$chart: the raw column $sourceField sets the parameter",
    ({ data, event, sourceField, expected }) => {
      const payload = buildClickPayload(
        ev(event as Partial<EChartsClickEvent>),
        data,
      );
      expect(resolvedValue(payload, sourceField)).toBe(expected);
      expect("properties" in payload!).toBe(false);
    },
  );

  it("pie: the Other slice spans many rows, so no raw column resolves", () => {
    const payload = buildClickPayload(
      ev({
        seriesType: "pie",
        dataIndex: 1,
        name: "Other",
        value: 12,
        data: { name: "Other", value: 12 },
      } as Partial<EChartsClickEvent>),
      pieData,
    );
    expect(payload!.name).toBe("Other");
    expect(resolvedValue(payload, "status")).toBeUndefined();
  });

  it("sankey: a node click carries the node name only — a node spans many rows", () => {
    const payload = buildClickPayload(
      ev({
        seriesType: "sankey",
        dataIndex: 0,
        name: "A",
        data: { name: "A" },
      } as Partial<EChartsClickEvent>),
      sankeyData,
    );
    expect(payload!.name).toBe("A");
    expect(resolvedValue(payload, "dst")).toBeUndefined();
  });
});
