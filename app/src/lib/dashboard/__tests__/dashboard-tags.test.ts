import { describe, it, expect } from "vitest";
import {
  cleanDashboardTags,
  parseTagsInput,
  MAX_TAGS,
  MAX_TAG_LENGTH,
} from "../dashboard-tags";

describe("cleanDashboardTags", () => {
  it.each([
    [[" Sales ", "sales", "", "  "], ["Sales"]],
    [
      ["b", "A", "a", "B"],
      ["b", "A"],
    ],
    [[], []],
  ])("cleans %j", (input, expected) => {
    expect(cleanDashboardTags(input)).toEqual(expected);
  });
});

describe("parseTagsInput", () => {
  it("splits on commas and cleans", () => {
    expect(parseTagsInput(" Sales , sales,, finance ")).toEqual({
      ok: true,
      tags: ["Sales", "finance"],
    });
  });
  it("empty input is no tags", () => {
    expect(parseTagsInput("  ")).toEqual({ ok: true, tags: [] });
  });
  it("refuses more than 20 tags", () => {
    const input = Array.from({ length: MAX_TAGS + 1 }, (_, i) => `t${i}`).join(
      ",",
    );
    expect(parseTagsInput(input)).toEqual({
      ok: false,
      error: "At most 20 tags.",
    });
  });
  it("refuses a tag over 100 characters", () => {
    expect(parseTagsInput("x".repeat(MAX_TAG_LENGTH + 1))).toEqual({
      ok: false,
      error: "A tag can be at most 100 characters.",
    });
  });
});
