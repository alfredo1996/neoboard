import { describe, it, expect } from "vitest";
import {
  dashboardTagsSchema,
  parseTagsInput,
  filterDashboardsByTag,
  collectDashboardTags,
  tagsInputError,
  sameTags,
  ALL_TAGS,
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

  // The dialogs split on "," — a tag carrying one would be re-split on the
  // next save, so the API must not admit it either (#1715 review).
  it("rejects a tag containing the input delimiter", () => {
    const result = dashboardTagsSchema.safeParse(["a,b"]);
    expect(result.success).toBe(false);
    expect(result.error?.issues[0].message).toBe("Tags cannot contain commas");
  });

  it("can never produce the filter's ALL_TAGS sentinel", () => {
    expect(dashboardTagsSchema.safeParse([ALL_TAGS]).success).toBe(false);
  });
});

describe("tagsInputError (#1715 review)", () => {
  it("is null for tags the schema accepts", () => {
    expect(tagsInputError(["sales", "kpi"])).toBeNull();
    expect(tagsInputError([])).toBeNull();
  });

  it("names the tag-count cap", () => {
    const tags = Array.from({ length: MAX_TAGS + 1 }, (_, i) => `t${i}`);
    expect(tagsInputError(tags)).toBe(`Use at most ${MAX_TAGS} tags`);
  });

  it("names the tag-length cap", () => {
    expect(tagsInputError(["x".repeat(MAX_TAG_LENGTH + 1)])).toBe(
      `Each tag must be ${MAX_TAG_LENGTH} characters or fewer`,
    );
  });
});

describe("sameTags (#1715 review)", () => {
  it("is true only for element-wise equal lists", () => {
    expect(sameTags(["a", "b"], ["a", "b"])).toBe(true);
    expect(sameTags([], [])).toBe(true);
    expect(sameTags(["a", "b"], ["b", "a"])).toBe(false);
    expect(sameTags(["a"], ["a", "b"])).toBe(false);
  });

  it("does not confuse a comma-bearing tag with the split list", () => {
    expect(sameTags(["a,b"], ["a", "b"])).toBe(false);
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
