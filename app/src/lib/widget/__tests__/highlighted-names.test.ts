import { describe, it, expect } from "vitest";
import { highlightedNames } from "../highlighted-names";

// The saved shape: `widget.settings.clickAction` (use-widget-save.ts), read
// with the widget's rows (bar: label, pie: name) and the live parameter values.
const settings = (clickAction: unknown) => ({
  chartOptions: { title: "x" },
  clickAction,
});
const set = (parameterName: string, sourceField: string) => ({
  type: "set-parameter",
  parameterMapping: { parameterName, sourceField },
});

const bars = [
  { label: "Home", value: 1, properties: { cat_id: 7, category: "Home" } },
  {
    label: "Outdoors",
    value: 2,
    properties: { cat_id: 9, category: "Outdoors" },
  },
];

describe("highlightedNames (#2226)", () => {
  it("names the rows whose source column holds the selected value", () => {
    expect(
      highlightedNames(bars, settings(set("p", "category")), { p: "Home" }),
    ).toEqual(["Home"]);
  });

  it("matches on any source column, not only the label (an id column)", () => {
    expect(
      highlightedNames(bars, settings(set("p", "cat_id")), { p: 9 }),
    ).toEqual(["Outdoors"]);
  });

  it("never matches an object cell, even against its stringified form", () => {
    const rows = [
      { label: "Nested", value: 1, properties: { meta: { a: 1 } } },
    ];
    expect(
      highlightedNames(rows, settings(set("p", "meta")), {
        p: "[object Object]",
      }),
    ).toBeUndefined();
  });

  it("matches a numeric parameter against a string column and back", () => {
    expect(
      highlightedNames(bars, settings(set("p", "cat_id")), { p: "7" }),
    ).toEqual(["Home"]);
  });

  it("reads the column straight off a pie row too", () => {
    const pie = [
      { name: "a", value: 1 },
      { name: "b", value: 2 },
    ];
    expect(
      highlightedNames(pie, settings(set("p", "name")), { p: "b" }),
    ).toEqual(["b"]);
  });

  it("handles rules[]: any rule's value highlights its rows", () => {
    const s = settings({
      type: "set-parameter",
      rules: [set("p", "category"), set("q", "cat_id")],
    });
    expect(highlightedNames(bars, s, { q: 9 })).toEqual(["Outdoors"]);
    expect(highlightedNames(bars, s, { p: "Home", q: 9 })).toEqual([
      "Home",
      "Outdoors",
    ]);
  });

  it("keeps every value of a multi-select parameter", () => {
    expect(
      highlightedNames(bars, settings(set("p", "category")), {
        p: ["Home", "Outdoors"],
      }),
    ).toEqual(["Home", "Outdoors"]);
  });

  it.each([
    ["no click action", {}, { p: "Home" }],
    [
      "a navigate-only action",
      settings({ type: "navigate-to-page" }),
      { p: "Home" },
    ],
    ["a parameter nobody set", settings(set("p", "category")), {}],
    ["an emptied parameter", settings(set("p", "category")), { p: null }],
    ["another parameter", settings(set("p", "category")), { other: "Home" }],
    ["a value no row holds", settings(set("p", "category")), { p: "Toys" }],
    ["a column no row has", settings(set("p", "nope")), { p: "Home" }],
  ])("is undefined for %s", (_n, s, params) => {
    expect(highlightedNames(bars, s, params)).toBeUndefined();
  });

  it("is undefined when the data is not a row list", () => {
    expect(
      highlightedNames({ nodes: [] }, settings(set("p", "x")), { p: 1 }),
    ).toBeUndefined();
  });
});
