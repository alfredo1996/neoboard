import { describe, it, expect } from "vitest";
import {
  computeOpenItems,
  addItemToList,
  removeItemFromList,
  updateItemInList,
} from "../use-accordion-crud";

describe("computeOpenItems", () => {
  it("auto-expands newly added items", () => {
    const prevIds = new Set(["a", "b"]);
    const currentIds = ["a", "b", "c"];
    const openItems = ["a"];

    const result = computeOpenItems(prevIds, currentIds, openItems);

    expect(result).toEqual(["a", "c"]);
  });

  it("removes stale IDs when items are deleted", () => {
    const prevIds = new Set(["a", "b", "c"]);
    const currentIds = ["a", "c"];
    const openItems = ["a", "b", "c"];

    const result = computeOpenItems(prevIds, currentIds, openItems);

    expect(result).toEqual(["a", "c"]);
  });

  it("both adds and cleans in one pass", () => {
    const prevIds = new Set(["a", "b"]);
    const currentIds = ["a", "c"]; // b removed, c added
    const openItems = ["a", "b"];

    const result = computeOpenItems(prevIds, currentIds, openItems);

    expect(result).toEqual(["a", "c"]);
  });

  it("returns same open items when nothing changed", () => {
    const prevIds = new Set(["a", "b"]);
    const currentIds = ["a", "b"];
    const openItems = ["a"];

    const result = computeOpenItems(prevIds, currentIds, openItems);

    expect(result).toEqual(["a"]);
  });

  it("handles empty initial state", () => {
    const prevIds = new Set<string>();
    const currentIds = ["a"];
    const openItems: string[] = [];

    const result = computeOpenItems(prevIds, currentIds, openItems);

    expect(result).toEqual(["a"]);
  });
});

describe("addItemToList", () => {
  it("appends a new item created by factory", () => {
    const items = [{ id: "a", name: "first" }];
    const result = addItemToList(items, () => ({ id: "b", name: "second" }));

    expect(result).toEqual([
      { id: "a", name: "first" },
      { id: "b", name: "second" },
    ]);
  });

  it("does not mutate the original array", () => {
    const items = [{ id: "a" }];
    const result = addItemToList(items, () => ({ id: "b" }));

    expect(items).toHaveLength(1);
    expect(result).toHaveLength(2);
  });
});

describe("removeItemFromList", () => {
  it("removes item by id", () => {
    const items = [{ id: "a" }, { id: "b" }, { id: "c" }];
    const result = removeItemFromList(items, "b");

    expect(result).toEqual([{ id: "a" }, { id: "c" }]);
  });

  it("returns same-shape array when id not found", () => {
    const items = [{ id: "a" }];
    const result = removeItemFromList(items, "z");

    expect(result).toEqual([{ id: "a" }]);
  });
});

describe("updateItemInList", () => {
  it("merges patch into matching item", () => {
    const items = [
      { id: "a", name: "old", value: 1 },
      { id: "b", name: "keep", value: 2 },
    ];
    const result = updateItemInList(items, "a", { name: "new" });

    expect(result).toEqual([
      { id: "a", name: "new", value: 1 },
      { id: "b", name: "keep", value: 2 },
    ]);
  });

  it("preserves item identity for non-matching items", () => {
    const itemB = { id: "b", name: "keep" };
    const items = [{ id: "a", name: "old" }, itemB];
    const result = updateItemInList(items, "a", { name: "new" });

    expect(result[1]).toBe(itemB);
  });
});
