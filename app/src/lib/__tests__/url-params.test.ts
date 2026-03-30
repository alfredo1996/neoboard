import { describe, it, expect } from "vitest";
import { parseUrlParams, buildUrlParams } from "../url-params";

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
});
