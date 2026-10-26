import { describe, it, expect } from "vitest";
import { buildDashboardFilters } from "../dashboard-filters";
import type { ParameterSourceMap } from "../collect-parameter-names";
import type { ParameterEntry } from "@/stores/parameter-store";

const src = (id: string, label?: string, page = "Overview") => ({
  widgetId: id,
  widgetTitle: `Widget ${id}`,
  pageId: `pg-${page}`,
  pageTitle: page,
  connectionId: "c",
  label,
});
const entry = (value: unknown, sourceWidgetId?: string): ParameterEntry => ({
  value,
  source: "Region",
  field: "x",
  type: "text",
  sourceType: "default",
  sourceWidgetId,
});

const map: ParameterSourceMap = {
  region: [src("w1", "Region")],
  decade: [src("w2", "Decade", "Regions")],
  actor: [src("w3")],
};

describe("buildDashboardFilters", () => {
  it("lists every filter the dashboard has, set first then unset, by label within each group", () => {
    const f = buildDashboardFilters(map, { decade: entry("1990s", "w2") });
    expect(f.map((x) => [x.id, x.label, x.value])).toEqual([
      ["decade", "Decade", "1990s"],
      ["actor", "Actor", undefined],
      ["region", "Region", undefined],
    ]);
  });

  it("says where a filter is set: its selector and page", () => {
    const [d] = buildDashboardFilters(map, { decade: entry("1990s", "w2") });
    expect(d.where).toBe("Widget w2 · Regions");
    expect(d.sourceWidgetId).toBe("w2");
    expect(d.pageId).toBe("pg-Regions");
  });

  it("includes a set parameter no widget declares (e.g. from the URL), without a where", () => {
    const f = buildDashboardFilters({}, { q: entry("mov") });
    expect(f).toHaveLength(1);
    expect(f[0]).toMatchObject({ id: "q", value: "mov" });
    expect(f[0].where).toBeUndefined();
  });

  it("shows a range's sub-parameters instead of its parent", () => {
    const f = buildDashboardFilters(
      { dates: [src("w9", "Dates")] },
      { dates_from: entry("a"), dates_to: entry("b") },
    );
    expect(f.map((x) => x.id)).toEqual(["dates_from", "dates_to"]);
  });

  it("is empty for a dashboard with no filters", () => {
    expect(buildDashboardFilters({}, {})).toEqual([]);
  });
});
