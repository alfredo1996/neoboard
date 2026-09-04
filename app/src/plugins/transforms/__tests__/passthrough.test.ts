import { describe, it, expect } from "vitest";
import { transformToGanttData } from "../../gantt/transform";
import { transformToChoroplethData } from "../../choropleth/transform";
import { transformToMapData } from "../../map/transform";

/**
 * Ratchet (#1589). The click-action editor offers every RAW query column as a
 * Source Field (`action-rules-editor.tsx:182-200`, fed from
 * `widget-editor-modal.tsx:496`), but the click payload is built from the
 * TRANSFORMED item (`plugins/utils.ts:44-52`). A transform that rebuilds items
 * from only the fields it detects therefore makes the offered column resolve to
 * `undefined`, and `resolve-click-action.ts:78` drops the action in silence.
 *
 * Every transform whose chart builds a click payload from transformed items
 * keeps the raw row under `properties` — the shape map has always used. Charts
 * whose items ARE ECharts data objects (pie, sunburst, treemap, sankey) are
 * deliberately absent: an extra key there can change rendering. Add a row here
 * when a plugin joins the payload surface.
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
});
