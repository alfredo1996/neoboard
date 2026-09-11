import { describe, it, expect } from "vitest";
import { transformToGanttData } from "../../gantt/transform";
import { transformToChoroplethData } from "../../choropleth/transform";
import { transformToMapData } from "../../map/transform";
import { transformToBarData } from "../../bar/transform";
import { transformToLineData } from "../../line/transform";
import { transformToPieData } from "../../pie/transform";
import { transformToSankeyData } from "../../sankey/transform";

/**
 * Ratchet (#1589). The click-action editor offers every RAW query column as a
 * Source Field (`action-rules-editor.tsx:182-200`, fed from
 * `widget-editor-modal.tsx:496`), but the click payload is built from the
 * TRANSFORMED item (`plugins/utils.ts:44-52`). A transform that rebuilds items
 * from only the fields it detects therefore makes the offered column resolve to
 * `undefined`, and `resolve-click-action.ts:78` drops the action in silence.
 *
 * Every transform whose chart builds a click payload from transformed items
 * keeps the raw row under `properties` — the shape map has always used. Pie
 * items and sankey links are ECharts data objects, but ECharts ignores a key it
 * does not know: an SSR render of both with and without `properties` is
 * byte-identical (echarts 6.1.0, #1598). Sunburst carries its columns on the
 * datum itself. Add a row here when a plugin joins the payload surface.
 */
describe("transform row passthrough (#1589)", () => {
  const cases = [
    {
      type: "gantt",
      transform: (rows: Record<string, unknown>[]) =>
        transformToGanttData(rows),
      row: {
        task: "Design",
        start: "2026-01-01",
        end: "2026-01-02",
        owner: "bob",
      },
    },
    {
      type: "choropleth",
      transform: (rows: Record<string, unknown>[]) =>
        transformToChoroplethData(rows),
      row: { country: "France", value: 3, owner: "bob" },
    },
    {
      type: "map",
      transform: (rows: Record<string, unknown>[]) => transformToMapData(rows),
      row: { name: "x", lat: 1, lng: 2, owner: "bob" },
    },
    {
      type: "bar",
      transform: (rows: Record<string, unknown>[]) => transformToBarData(rows),
      row: { genre: "rock", films: 3, owner: "bob" },
    },
    {
      type: "line",
      transform: (rows: Record<string, unknown>[]) => transformToLineData(rows),
      row: { month: "Jan", revenue: 1, owner: "bob" },
    },
    {
      type: "pie",
      transform: (rows: Record<string, unknown>[]) => transformToPieData(rows),
      row: { status: "open", total: 3, owner: "bob" },
    },
    {
      type: "sankey",
      transform: (rows: Record<string, unknown>[]) =>
        (transformToSankeyData(rows) as { links: unknown[] }).links,
      row: { src: "A", dst: "B", amount: 1, owner: "bob" },
    },
  ];

  it.each(cases)(
    "$type keeps every raw column reachable from the transformed item",
    ({ transform, row }) => {
      const out = transform([row]) as Record<string, unknown>[];
      expect(out).toHaveLength(1);
      const properties = out[0].properties as Record<string, unknown>;
      expect(properties).toBeDefined();
      expect(properties.owner).toBe("bob");
    },
  );

  it("gantt: detected fields still win over the raw row", () => {
    const out = transformToGanttData([
      {
        task: "Design",
        start: "2026-01-01",
        end: "2026-01-02",
        progress: 150,
      },
    ]) as Record<string, unknown>[];
    // start/end are parsed to epoch numbers, not left as the raw strings.
    expect(typeof out[0].start).toBe("number");
    expect(typeof out[0].end).toBe("number");
    // progress is scaled and clamped, not the raw 150.
    expect(out[0].progress).toBe(1);
    expect((out[0].properties as Record<string, unknown>).start).toBe(
      "2026-01-01",
    );
  });

  it("choropleth: detected fields still win over the raw row", () => {
    // normalizeValue coerces non-strings (it does NOT trim — see
    // lib/normalize-value.ts), and value is forced numeric. Both must survive
    // the raw row sitting alongside them.
    const out = transformToChoroplethData([{ name: 42, value: "3" }]) as Record<
      string,
      unknown
    >[];
    expect(out[0].name).toBe("42");
    expect(out[0].value).toBe(3);
    expect((out[0].properties as Record<string, unknown>).name).toBe(42);
  });

  it("sankey: a link keeps its own row when an earlier row was dropped", () => {
    const { links } = transformToSankeyData([
      { source: "A", target: "A", value: 1, owner: "loop" },
      { source: "A", target: "B", value: 2, owner: "bob" },
    ]) as { links: Record<string, unknown>[] };
    expect(links).toHaveLength(1);
    expect((links[0].properties as Record<string, unknown>).owner).toBe("bob");
  });

  it.each([
    ["bar", transformToBarData],
    ["line", transformToLineData],
  ] as const)(
    "%s: a series column that is itself named properties still renders",
    (_type, transform) => {
      const out = transform([{ k: "a", properties: 4 }]) as Record<
        string,
        unknown
      >[];
      expect(out[0].properties).toBe(4);
    },
  );
});
