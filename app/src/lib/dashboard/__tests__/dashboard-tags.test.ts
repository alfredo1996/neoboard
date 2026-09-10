import { describe, it, expect } from "vitest";
import {
  dashboardTagsSchema,
  parseTagsInput,
  filterDashboardsByTag,
  collectDashboardTags,
  MAX_TAGS,
  MAX_TAG_LENGTH,
} from "../dashboard-tags";

const LIST = [
  { name: "Sales Overview", tags: ["sales", "kpi"] },
  { name: "Ops", tags: ["ops"] },
  { name: "Untagged", tags: [] },
];

describe("dashboardTagsSchema (#1692)", () => {
  it("accepts a short list of short strings, trimmed and deduped", () => {
    expect(
      dashboardTagsSchema.safeParse([" sales ", "kpi", "sales"]),
    ).toMatchObject({ success: true, data: ["sales", "kpi"] });
  });

  it("rejects an empty tag", () => {
    expect(dashboardTagsSchema.safeParse(["ok", "  "]).success).toBe(false);
  });

  it("rejects a tag longer than MAX_TAG_LENGTH", () => {
    expect(
      dashboardTagsSchema.safeParse(["x".repeat(MAX_TAG_LENGTH + 1)]).success,
    ).toBe(false);
  });

  it("rejects more than MAX_TAGS tags", () => {
    const tags = Array.from({ length: MAX_TAGS + 1 }, (_, i) => `t${i}`);
    expect(dashboardTagsSchema.safeParse(tags).success).toBe(false);
  });

  it("rejects non-string members", () => {
    expect(dashboardTagsSchema.safeParse([1, "a"]).success).toBe(false);
  });
});

describe("parseTagsInput (#1692)", () => {
  it("splits on commas, trims, drops empties and duplicates", () => {
    expect(parseTagsInput(" sales, kpi ,, sales ,")).toEqual(["sales", "kpi"]);
  });

  it("returns an empty array for blank input", () => {
    expect(parseTagsInput("   ")).toEqual([]);
  });
});

describe("filterDashboardsByTag (#1692)", () => {
  it("returns every dashboard when no tag is selected", () => {
    expect(filterDashboardsByTag(LIST, "")).toHaveLength(3);
  });

  it("keeps only dashboards carrying the tag", () => {
    expect(filterDashboardsByTag(LIST, "sales").map((d) => d.name)).toEqual([
      "Sales Overview",
    ]);
  });
});

describe("collectDashboardTags (#1692)", () => {
  it("returns the sorted, unique tags across the list", () => {
    expect(
      collectDashboardTags([...LIST, { name: "Dup", tags: ["kpi"] }]),
    ).toEqual(["kpi", "ops", "sales"]);
  });
});
