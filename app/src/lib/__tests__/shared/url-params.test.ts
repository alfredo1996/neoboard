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

  it("collects repeated keys into an array (multi-select deep-link)", () => {
    const sp = new URLSearchParams("param_tags=one&param_tags=two");
    expect(parseUrlParams(sp)).toEqual({ tags: ["one", "two"] });
  });

  it("returns a scalar (not a single-element array) for a key that appears once", () => {
    const sp = new URLSearchParams("param_year=1999");
    expect(parseUrlParams(sp)).toEqual({ year: "1999" });
  });

  it("drops empty values from a repeated-key set", () => {
    const sp = new URLSearchParams("param_tags=one&param_tags=&param_tags=two");
    expect(parseUrlParams(sp)).toEqual({ tags: ["one", "two"] });
  });

  it("mixes repeated and scalar keys in one parse", () => {
    const sp = new URLSearchParams(
      "param_year=1999&param_tags=one&param_tags=two",
    );
    expect(parseUrlParams(sp)).toEqual({
      year: "1999",
      tags: ["one", "two"],
    });
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

  it("appends each element of an array value as a repeated key", () => {
    const sp = buildUrlParams({ tags: ["drama", "comedy"] });
    expect(sp.getAll("param_tags")).toEqual(["drama", "comedy"]);
  });

  it("round-trips a multi-select value through parse → build", () => {
    const original = new URLSearchParams("param_tags=drama&param_tags=comedy");
    const parsed = parseUrlParams(original);
    const rebuilt = buildUrlParams(parsed);
    expect(rebuilt.getAll("param_tags")).toEqual(["drama", "comedy"]);
  });

  it("skips empty arrays entirely", () => {
    const sp = buildUrlParams({ tags: [] });
    expect(sp.has("param_tags")).toBe(false);
  });

  it("filters empty/null elements out of an array value", () => {
    const sp = buildUrlParams({ tags: ["a", "", "b", null, undefined] });
    expect(sp.getAll("param_tags")).toEqual(["a", "b"]);
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
