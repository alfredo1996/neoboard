import { describe, it, expect } from "vitest";
import {
  parseUrlParams,
  buildUrlParams,
  extractNoSyncParams,
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

describe("buildUrlParams", () => {
  it("builds param_ prefixed search params", () => {
    const sp = buildUrlParams({ year: "1999", dept: "Sales" });
    expect(sp.get("param_year")).toBe("1999");
    expect(sp.get("param_dept")).toBe("Sales");
  });

  it("skips undefined and null values", () => {
    const sp = buildUrlParams({ year: "1999", dept: undefined, team: null });
    expect(sp.has("param_dept")).toBe(false);
    expect(sp.has("param_team")).toBe(false);
    expect(sp.get("param_year")).toBe("1999");
  });

  it("skips empty string values", () => {
    const sp = buildUrlParams({ year: "1999", dept: "" });
    expect(sp.has("param_dept")).toBe(false);
  });

  it("converts numbers to strings", () => {
    const sp = buildUrlParams({ count: 42 });
    expect(sp.get("param_count")).toBe("42");
  });

  it("returns empty params for empty input", () => {
    const sp = buildUrlParams({});
    expect(sp.toString()).toBe("");
  });

  it("sorts params alphabetically", () => {
    const sp = buildUrlParams({ z: "1", a: "2", m: "3" });
    expect(sp.toString()).toBe("param_a=2&param_m=3&param_z=1");
  });

  it("excludes params in the excludeFromUrl set", () => {
    const sp = buildUrlParams(
      { year: "1999", secret: "hidden", dept: "Sales" },
      new Set(["secret"]),
    );
    expect(sp.has("param_year")).toBe(true);
    expect(sp.has("param_dept")).toBe(true);
    expect(sp.has("param_secret")).toBe(false);
  });
});

describe("extractNoSyncParams", () => {
  it("returns empty set when no widgets have syncToUrl: false", () => {
    const layout: DashboardLayoutV2 = {
      version: 2,
      pages: [
        {
          id: "p1",
          title: "Page 1",
          widgets: [
            {
              id: "w1",
              chartType: "parameter-select",
              connectionId: "c1",
              query: "",
              settings: {
                chartOptions: { parameterName: "year", syncToUrl: true },
              },
            },
          ],
          gridLayout: [],
        },
      ],
    };
    expect(extractNoSyncParams(layout)).toEqual(new Set());
  });

  it("returns param names where syncToUrl is false", () => {
    const layout: DashboardLayoutV2 = {
      version: 2,
      pages: [
        {
          id: "p1",
          title: "Page 1",
          widgets: [
            {
              id: "w1",
              chartType: "parameter-select",
              connectionId: "c1",
              query: "",
              settings: {
                chartOptions: { parameterName: "secret", syncToUrl: false },
              },
            },
            {
              id: "w2",
              chartType: "parameter-select",
              connectionId: "c1",
              query: "",
              settings: { chartOptions: { parameterName: "visible" } },
            },
          ],
          gridLayout: [],
        },
      ],
    };
    expect(extractNoSyncParams(layout)).toEqual(new Set(["secret"]));
  });
});
