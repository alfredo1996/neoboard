import { describe, it, expect } from "vitest";
import { buildShareLink } from "../share-link";
import type { ParameterEntry } from "@/stores/parameter-store";

function entry(value: unknown): ParameterEntry {
  return {
    value,
    source: "w",
    field: "f",
    type: "text",
    sourceType: "selector-widget",
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
    expect(unsynced).toEqual(["region"]);
  });

  it("returns the bare dashboard URL when nothing is synced", () => {
    const { url, unsynced } = buildShareLink(
      ORIGIN,
      "/d1",
      { region: entry("EMEA") },
      new Set(),
    );
    expect(url).toBe("https://nb.example.com/d1");
    expect(unsynced).toEqual(["region"]);
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
    expect(unsynced).toEqual(["period", "amount"]);
  });

  it("keeps the unsynced list in store order and deduplicated", () => {
    const { unsynced } = buildShareLink(
      ORIGIN,
      "/d1",
      { b: entry("1"), a: entry("2"), b_from: entry("3") },
      new Set(),
    );
    expect(unsynced).toEqual(["b", "a"]);
  });
});
