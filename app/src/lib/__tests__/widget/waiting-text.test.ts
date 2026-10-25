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
      "Pick a gallery region above to see this.",
    ],
    [
      "keeps the label's own casing",
      ["q1_2024"],
      sourced,
      "Pick a q1 2024 above to see this.",
    ],
    [
      "one parameter, named by its selector widget",
      ["gallery_region"],
      { gallery_region: [{ ...source, label: "Region" }] },
      "Pick a region above to see this.",
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
});
