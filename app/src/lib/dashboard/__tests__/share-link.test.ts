import { describe, it, expect } from "vitest";
import { buildShareLink } from "../share-link";
import type { ParameterEntry, ParameterSource } from "@/stores/parameter-store";

function entry(
  value: unknown,
  sourceType: ParameterSource = "selector-widget",
  sourceWidgetId?: string,
): ParameterEntry {
  return {
    value,
    source: "w",
    field: "f",
    type: "text",
    sourceType,
    sourceWidgetId,
  };
}

const ORIGIN = "https://nb.example.com";

describe("buildShareLink", () => {
  it("builds an absolute URL carrying only the synced parameters", () => {
    const { url, unsynced } = buildShareLink(
      ORIGIN,
      "/d1",
      { dept: entry("Sales"), region: entry("EMEA") },
      new Set(["dept"]),
    );
    expect(url).toBe("https://nb.example.com/d1?param_dept=Sales");
    expect(unsynced).toEqual([{ name: "region" }]);
  });

  it("returns the bare dashboard URL when nothing is synced", () => {
    const { url, unsynced } = buildShareLink(
      ORIGIN,
      "/d1",
      { region: entry("EMEA") },
      new Set(),
    );
    expect(url).toBe("https://nb.example.com/d1");
    expect(unsynced).toEqual([{ name: "region" }]);
  });

  it("reports nothing unsynced when every set parameter is in the link", () => {
    const { unsynced } = buildShareLink(
      ORIGIN,
      "/d1",
      { dept: entry("Sales") },
      new Set(["dept"]),
    );
    expect(unsynced).toEqual([]);
  });

  it("ignores cleared parameters — an empty value is not lost by the link", () => {
    const { url, unsynced } = buildShareLink(
      ORIGIN,
      "/d1",
      { dept: entry(""), region: entry(null), year: entry(undefined) },
      new Set(["dept"]),
    );
    expect(url).toBe("https://nb.example.com/d1");
    expect(unsynced).toEqual([]);
  });

  it("names a range parameter once, by its widget name, not per companion", () => {
    const { unsynced } = buildShareLink(
      ORIGIN,
      "/d1",
      {
        period_from: entry("2024-01-01"),
        period_to: entry("2024-12-31"),
        amount_min: entry(0),
        amount_max: entry(100),
      },
      new Set(),
    );
    expect(unsynced.map((u) => u.name)).toEqual(["period", "amount"]);
  });

  it("keeps the unsynced list in store order and deduplicated", () => {
    const { unsynced } = buildShareLink(
      ORIGIN,
      "/d1",
      { b: entry("1"), a: entry("2"), b_from: entry("3") },
      new Set(),
    );
    expect(unsynced.map((u) => u.name)).toEqual(["b", "a"]);
  });

  // The recipient's own load re-applies a widget's Default value (#1421), so
  // a default the sender never touched is not something the link loses.
  it("does not report a widget default", () => {
    const { url, unsynced } = buildShareLink(
      ORIGIN,
      "/d1",
      { dept: entry("Sales", "default", "pw1") },
      new Set(),
    );
    expect(url).toBe("https://nb.example.com/d1");
    expect(unsynced).toEqual([]);
  });

  it("still reports a default the user changed", () => {
    const { unsynced } = buildShareLink(
      ORIGIN,
      "/d1",
      { dept: entry("Marketing", "selector-widget", "pw1") },
      new Set(),
    );
    expect(unsynced).toEqual([{ name: "dept", widgetId: "pw1" }]);
  });

  // The widget id is what lets the toast open the editor on the right widget.
  // Only a parameter-select widget has a "Sync to URL" toggle to flip.
  it("names the widget that owns the toggle for a selector parameter", () => {
    const { unsynced } = buildShareLink(
      ORIGIN,
      "/d1",
      { region: entry("EMEA", "selector-widget", "pw2") },
      new Set(),
    );
    expect(unsynced).toEqual([{ name: "region", widgetId: "pw2" }]);
  });

  it("gives a click-action parameter no widget to fix", () => {
    const { unsynced } = buildShareLink(
      ORIGIN,
      "/d1",
      { region: entry("EMEA", "click-action", "chart1") },
      new Set(),
    );
    expect(unsynced).toHaveLength(1);
    expect(unsynced[0].name).toBe("region");
    expect(unsynced[0].widgetId).toBeUndefined();
  });

  it("carries the page being viewed, and only when it is not the first", () => {
    const params = { dept: entry("Sales") };
    expect(
      buildShareLink(ORIGIN, "/d1", params, new Set(["dept"]), 2).url,
    ).toBe("https://nb.example.com/d1?page=2&param_dept=Sales");
    expect(buildShareLink(ORIGIN, "/d1", {}, new Set(), 2).url).toBe(
      "https://nb.example.com/d1?page=2",
    );
    expect(
      buildShareLink(ORIGIN, "/d1", params, new Set(["dept"]), 0).url,
    ).toBe("https://nb.example.com/d1?param_dept=Sales");
  });

  it("copies a synced date-range as its companions, never as [object Object]", () => {
    const { url, unsynced } = buildShareLink(
      ORIGIN,
      "/d1",
      {
        period: entry({ from: "2024-01-01", to: "2024-12-31" }),
        period_from: entry("2024-01-01"),
        period_to: entry("2024-12-31"),
      },
      new Set(["period", "period_from", "period_to"]),
    );
    expect(url).toBe(
      "https://nb.example.com/d1?param_period_from=2024-01-01&param_period_to=2024-12-31",
    );
    expect(unsynced).toEqual([]);
  });
});
