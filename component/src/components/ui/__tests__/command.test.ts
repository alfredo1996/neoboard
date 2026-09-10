import { describe, it, expect } from "vitest";
import { filterOnLabel, toCmdkValue } from "../command";

// #1411: items carry a machine `value` (an id) and their visible label as
// `keywords`. The filter must score the label, never the id.
describe("filterOnLabel", () => {
  it("scores the label passed as keywords", () => {
    expect(filterOnLabel("4:p:1", "Keanu", ["Keanu Reeves"])).toBeGreaterThan(0);
  });

  it("does not match a term that appears only in the value", () => {
    expect(filterOnLabel("4:p:1", "4:p", ["Keanu Reeves"])).toBe(0);
  });

  it("falls back to the value when the item passes no keywords", () => {
    expect(filterOnLabel("Create tag", "create", undefined)).toBeGreaterThan(0);
  });

  it("falls back to the value when keywords is empty", () => {
    expect(filterOnLabel("Create tag", "create", [])).toBeGreaterThan(0);
  });
});

// cmdk trims an item's value and scores an empty one as 0 before any filter
// runs, so a raw option value cannot be its cmdk identity.
describe("toCmdkValue", () => {
  it("never yields an empty identity", () => {
    expect(toCmdkValue("").trim()).not.toBe("");
  });

  it("keeps values that differ only by surrounding whitespace distinct", () => {
    expect(toCmdkValue("NY").trim()).not.toBe(toCmdkValue("NY ").trim());
    expect(toCmdkValue(" NY").trim()).not.toBe(toCmdkValue("NY").trim());
  });
});
