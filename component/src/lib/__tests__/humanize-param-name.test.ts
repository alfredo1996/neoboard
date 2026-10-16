import { describe, it, expect } from "vitest";
import { humanizeParamName } from "../humanize-param-name";

describe("humanizeParamName (#2213)", () => {
  it.each([
    ["gallery_region", "Gallery region"],
    ["ref_region_d", "Ref region d"],
    ["startDate", "Start date"],
    ["year2", "Year 2"],
    ["actor", "Actor"],
    ["__a__b", "A b"],
    ["", ""],
    ["already spaced Words", "Already spaced Words"],
    ["HTTPStatus", "Http status"],
    ["APIKey", "Api key"],
    ["___", "___"],
    ["n4j_label", "N4j label"],
    ["top10Items", "Top10 items"],
    ["cittàScelta", "Città scelta"],
    ["rf1_score", "Rf1 score"],
    ["q1_2024", "Q1 2024"],
    ["page_2", "Page 2"],
    ["x_y_z9", "X y z 9"],
  ])("%j -> %j", (input, expected) => {
    expect(humanizeParamName(input)).toBe(expected);
  });
});
