import { describe, it, expect } from "vitest";
import { humanizeParamName, pickPrompt } from "../humanize-param-name";

describe("pickPrompt (#2232)", () => {
  it.each([
    ["Region", "Pick a region"],
    ["Gallery region", "Pick a gallery region"],
    ["Item", "Pick item"],
    ["Order status", "Pick order status"],
    ["user id", "Pick user id"],
    ["Date Picker", "Pick a date picker"],
    ["Movie by Director", "Pick a movie by director"],
    ["Sales Region", "Pick a sales region"],
    ["KPI filter", "Pick KPI filter"],
    ["SKU", "Pick SKU"],
    ["Q1 2024", "Pick Q1 2024"],
    ["iPhone model", "Pick iPhone model"],
    ["Year", "Pick a year"],
    ["Choice", "Pick a choice"],
  ])("%j -> %j", (label, expected) => {
    expect(pickPrompt(label)).toBe(expected);
  });
});

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
    ["XMLHttpRequest", "Xml http request"],
  ])("%j -> %j", (input, expected) => {
    expect(humanizeParamName(input)).toBe(expected);
  });
});
