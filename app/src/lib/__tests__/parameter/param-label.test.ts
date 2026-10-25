import { describe, it, expect } from "vitest";
import { paramLabel } from "@/lib/parameter/param-label";
import {
  buildParameterSourceMap,
  type ParameterSourceMap,
} from "@/lib/parameter/collect-parameter-names";
import type { DashboardLayoutV2 } from "@/lib/db/schema";

const src = (label?: string) => ({
  widgetId: "w",
  widgetTitle: "x",
  pageId: "p",
  pageTitle: "P",
  connectionId: "c",
  label,
});

describe("paramLabel (#2232)", () => {
  it.each<[string, ParameterSourceMap | undefined, string]>([
    [
      "the selector widget's title",
      { gallery_region: [src("Region")] },
      "Region",
    ],
    ["the humanised key, never the raw one", {}, "Gallery region"],
    ["no map", undefined, "Gallery region"],
    [
      "the humanised key when no source is a titled selector",
      { gallery_region: [src()] },
      "Gallery region",
    ],
    [
      "the first titled selector",
      { gallery_region: [src(), src("Area"), src("Zone")] },
      "Area",
    ],
  ])("%s", (_n, map, expected) => {
    expect(paramLabel("gallery_region", map)).toBe(expected);
  });
});

describe("buildParameterSourceMap labels (#2232)", () => {
  const layout = (widgets: unknown[]) =>
    ({
      pages: [{ id: "p", title: "P", widgets, gridLayout: [] }],
    }) as unknown as DashboardLayoutV2;

  it("labels a titled parameter-select with its title, and nothing else", () => {
    const map = buildParameterSourceMap(
      layout([
        {
          id: "sel",
          chartType: "parameter-select",
          connectionId: "c",
          query: "",
          settings: { title: "Region", chartOptions: { parameterName: "r" } },
        },
        {
          id: "bar",
          chartType: "bar",
          connectionId: "c",
          query: "",
          settings: {
            title: "Bar",
            clickAction: { parameterMapping: { parameterName: "r" } },
          },
        },
        {
          id: "untitled",
          chartType: "parameter-select",
          connectionId: "c",
          query: "",
          settings: { chartOptions: { parameterName: "q" } },
        },
      ]),
    );
    expect(map.r.find((s) => s.widgetId === "sel")?.label).toBe("Region");
    expect(map.r.find((s) => s.widgetId === "bar")?.label).toBeUndefined();
    expect(map.q[0].label).toBeUndefined();
  });
});
