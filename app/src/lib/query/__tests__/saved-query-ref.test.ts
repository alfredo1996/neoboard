import { describe, it, expect } from "vitest";
import { findSavedWidget } from "../saved-query-ref";

const w = (id: string, connectionId = "c1") => ({ id, connectionId });

describe("findSavedWidget (#2477)", () => {
  it.each([
    ["a v2 layout", { version: 2, pages: [{ widgets: [w("a"), w("b")] }] }],
    ["a v1 layout", { widgets: [w("a"), w("b")] }],
    [
      "a later page, after a page saved without widgets",
      { version: 2, pages: [{ id: "p0" }, { widgets: [w("b")] }] },
    ],
  ])("finds the widget in %s", (_n, layout) => {
    expect(findSavedWidget(layout as never, "b", "c1")).toMatchObject({
      id: "b",
    });
  });

  it.each([
    ["an unknown id", "zz", "c1"],
    ["another connection", "b", "c2"],
  ])("returns undefined for %s", (_n, id, connectionId) => {
    const layout = { version: 2, pages: [{ widgets: [w("b")] }] };
    expect(findSavedWidget(layout as never, id, connectionId)).toBeUndefined();
  });

  it("returns undefined for no layout", () => {
    expect(findSavedWidget(null, "b", "c1")).toBeUndefined();
  });
});
