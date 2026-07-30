import { describe, it, expect } from "vitest";
import {
  parseUrlParams,
  buildUrlParams,
  buildParamsUrl,
  extractSyncParams,
} from "@/lib/shared/url-params";
import type { DashboardLayoutV2 } from "@/lib/db/schema";

describe("parseUrlParams", () => {
  it("extracts param_ prefixed keys and strips prefix", () => {
    const sp = new URLSearchParams("param_year=1999&param_dept=Sales");
    expect(parseUrlParams(sp)).toEqual({ year: "1999", dept: "Sales" });
  });

  it("ignores keys without param_ prefix", () => {
    const sp = new URLSearchParams("param_year=1999&page=1&tab=data");
    expect(parseUrlParams(sp)).toEqual({ year: "1999" });
  });

  it("skips empty values", () => {
    const sp = new URLSearchParams("param_year=1999&param_dept=");
    expect(parseUrlParams(sp)).toEqual({ year: "1999" });
  });

  it("returns empty object for no params", () => {
    expect(parseUrlParams(new URLSearchParams())).toEqual({});
  });

  it("handles URL-encoded values", () => {
    const sp = new URLSearchParams("param_name=New%20York");
    expect(parseUrlParams(sp)).toEqual({ name: "New York" });
  });
});

const ALL = (...names: string[]) => new Set(names);

describe("buildUrlParams", () => {
  it("builds param_ prefixed search params", () => {
    const sp = buildUrlParams(
      { year: "1999", dept: "Sales" },
      ALL("year", "dept"),
    );
    expect(sp.get("param_year")).toBe("1999");
    expect(sp.get("param_dept")).toBe("Sales");
  });

  it("skips undefined and null values", () => {
    const sp = buildUrlParams(
      { year: "1999", dept: undefined, team: null },
      ALL("year", "dept", "team"),
    );
    expect(sp.has("param_dept")).toBe(false);
    expect(sp.has("param_team")).toBe(false);
    expect(sp.get("param_year")).toBe("1999");
  });

  it("skips empty string values", () => {
    const sp = buildUrlParams({ year: "1999", dept: "" }, ALL("year", "dept"));
    expect(sp.has("param_dept")).toBe(false);
  });

  it("converts numbers to strings", () => {
    const sp = buildUrlParams({ count: 42 }, ALL("count"));
    expect(sp.get("param_count")).toBe("42");
  });

  it("returns empty params for empty input", () => {
    const sp = buildUrlParams({}, ALL());
    expect(sp.toString()).toBe("");
  });

  it("sorts params alphabetically", () => {
    const sp = buildUrlParams({ z: "1", a: "2", m: "3" }, ALL("z", "a", "m"));
    expect(sp.toString()).toBe("param_a=2&param_m=3&param_z=1");
  });

  it("keeps only params in the syncable set", () => {
    const sp = buildUrlParams(
      { year: "1999", secret: "hidden", dept: "Sales" },
      ALL("year", "dept"),
    );
    expect(sp.has("param_year")).toBe(true);
    expect(sp.has("param_dept")).toBe(true);
    expect(sp.has("param_secret")).toBe(false);
  });

  it("drops everything when nothing opted in", () => {
    expect(buildUrlParams({ year: "1999" }, ALL()).toString()).toBe("");
  });
});

describe("buildParamsUrl", () => {
  const entry = (value: unknown) =>
    ({ value, source: "", field: "", type: "text" }) as never;

  it("builds a prefixed query string from store entries", () => {
    expect(
      buildParamsUrl(
        "/dash-1",
        { year: entry("1999"), dept: entry("Sales") },
        ALL("year", "dept"),
      ),
    ).toBe("/dash-1?param_dept=Sales&param_year=1999");
  });

  it("returns the bare pathname when nothing syncs", () => {
    expect(buildParamsUrl("/dash-1", { year: entry("") }, ALL("year"))).toBe(
      "/dash-1",
    );
  });

  it("omits params that did not opt in", () => {
    expect(
      buildParamsUrl(
        "/dash-1",
        { year: entry("1999"), secret: entry("hunter2") },
        ALL("year"),
      ),
    ).toBe("/dash-1?param_year=1999");
  });

  it("tolerates a missing entry", () => {
    expect(
      buildParamsUrl("/dash-1", { ghost: undefined as never }, ALL("ghost")),
    ).toBe("/dash-1");
  });
});

/** Build a single-page layout from parameter-select chartOptions. */
function layoutWith(
  ...chartOptions: Record<string, unknown>[]
): DashboardLayoutV2 {
  return {
    version: 2,
    pages: [
      {
        id: "p1",
        title: "Page 1",
        widgets: chartOptions.map((opts, i) => ({
          id: `w${i}`,
          chartType: "parameter-select",
          connectionId: "c1",
          query: "",
          settings: { chartOptions: opts },
        })),
        gridLayout: [],
      },
    ],
  };
}

describe("extractSyncParams", () => {
  it("returns param names that opted in with syncToUrl: true", () => {
    expect(
      extractSyncParams(
        layoutWith({ parameterName: "year", syncToUrl: true }),
      ).has("year"),
    ).toBe(true);
  });

  it("omits a param whose widget never touched the toggle", () => {
    // The option's default is false — an absent key means the UI shows the
    // toggle off, so the value must stay out of the URL.
    expect(extractSyncParams(layoutWith({ parameterName: "year" }))).toEqual(
      new Set(),
    );
  });

  it("omits a param that explicitly opted out", () => {
    expect(
      extractSyncParams(
        layoutWith({ parameterName: "secret", syncToUrl: false }),
      ),
    ).toEqual(new Set());
  });

  it("includes the companion keys an opted-in range parameter writes", () => {
    // A date-range widget stores `hired_from`/`hired_to` alongside `hired`;
    // a number-range stores `_min`/`_max`. Deep-linking needs them too.
    const sync = extractSyncParams(
      layoutWith({
        parameterName: "hired",
        parameterType: "date-range",
        syncToUrl: true,
      }),
    );
    expect(sync.has("hired_from")).toBe(true);
    expect(sync.has("hired_to")).toBe(true);
    expect(sync.has("hired_min")).toBe(true);
    expect(sync.has("hired_max")).toBe(true);
  });

  it("ignores widgets that are not parameter selectors", () => {
    const layout = layoutWith({ parameterName: "year", syncToUrl: true });
    layout.pages[0].widgets[0].chartType = "table";
    expect(extractSyncParams(layout)).toEqual(new Set());
  });
});
