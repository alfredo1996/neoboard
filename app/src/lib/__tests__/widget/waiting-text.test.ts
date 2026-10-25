import { describe, it, expect } from "vitest";
import { waitingText } from "@/lib/widget/waiting-text";
import type { ParameterSourceMap } from "@/lib/parameter/collect-parameter-names";

const source = {
  widgetId: "sel",
  widgetTitle: "Sel",
  pageId: "p1",
  pageTitle: "Main",
  connectionId: "c",
};
const sourced: ParameterSourceMap = {
  gallery_region: [source],
  q1_2024: [source],
};

describe("waitingText (#2214)", () => {
  it.each<[string, string[], ParameterSourceMap | undefined, string]>([
    ["nothing to name", [], undefined, "Waiting for parameters…"],
    [
      "one sourced parameter",
      ["gallery_region"],
      sourced,
      "Pick gallery region above to see this.",
    ],
    [
      "keeps the label's own casing",
      ["q1_2024"],
      sourced,
      "Pick Q1 2024 above to see this.",
    ],
    [
      "one parameter, named by its selector widget",
      ["gallery_region"],
      { gallery_region: [{ ...source, label: "Region" }] },
      "Pick region above to see this.",
    ],
    ["one unsourced parameter", ["year"], {}, "Waiting for Year"],
    ["no source map", ["year"], undefined, "Waiting for Year"],
    [
      "two parameters",
      ["gallery_region", "year"],
      sourced,
      "Waiting for Gallery region and Year",
    ],
    ["three parameters", ["a", "b", "c"], undefined, "Waiting for A, B and C"],
  ])("%s", (_n, missing, map, expected) => {
    expect(waitingText(missing, map)).toBe(expected);
  });

  it.each<[string, string, string]>([
    [
      "a source on this page says above",
      "p1",
      "Pick gallery region above to see this.",
    ],
    [
      "a source on another page names that page",
      "p2",
      "Pick gallery region on Main to see this.",
    ],
  ])("%s", (_n, currentPageId, expected) => {
    expect(waitingText(["gallery_region"], sourced, currentPageId)).toBe(
      expected,
    );
  });

  it("says above if any source is on this page", () => {
    const map: ParameterSourceMap = {
      gallery_region: [{ ...source, pageId: "p9", pageTitle: "Other" }, source],
    };
    expect(waitingText(["gallery_region"], map, "p1")).toBe(
      "Pick gallery region above to see this.",
    );
  });
});
