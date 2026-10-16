import { describe, it, expect } from "vitest";
import { selectedByClickAction } from "../utils";

const settings = (clickAction: unknown) => ({ clickAction });
const action = (type: string, parameterName = "category") => ({
  type,
  parameterMapping: { parameterName, sourceField: "label" },
});

describe("selectedByClickAction (#2226)", () => {
  it("returns the value the widget's own click action set", () => {
    expect(
      selectedByClickAction(settings(action("set-parameter")), {
        category: "Home",
      }),
    ).toEqual(["Home"]);
    expect(
      selectedByClickAction(settings(action("set-parameter-and-navigate")), {
        category: 7,
      }),
    ).toEqual([7]);
  });

  it("keeps every value of a multi-select parameter", () => {
    expect(
      selectedByClickAction(settings(action("set-parameter")), {
        category: ["Home", "Outdoors"],
      }),
    ).toEqual(["Home", "Outdoors"]);
  });

  it.each([
    ["no click action", {}, { category: "Home" }],
    [
      "a navigate-only action",
      settings(action("navigate-to-page")),
      { category: "Home" },
    ],
    ["a parameter nobody set", settings(action("set-parameter")), {}],
    [
      "an emptied parameter",
      settings(action("set-parameter")),
      { category: null },
    ],
    ["an empty string", settings(action("set-parameter")), { category: "" }],
    [
      "another widget's parameter",
      settings(action("set-parameter", "region")),
      { category: "Home" },
    ],
  ])("is undefined for %s", (_n, s, params) => {
    expect(selectedByClickAction(s, params)).toBeUndefined();
  });
});
