import { describe, it, expect } from "vitest";
import { bareName, qualifierOf, findColumn } from "../column-names";

describe("bareName", () => {
  it.each([
    ["c.latitude", "latitude"],
    ["latitude", "latitude"],
    ["a.b.c", "c"],
    ["", ""],
    [".leading", "leading"],
    ["trailing.", ""],
  ])("%s -> %s", (key, expected) => {
    expect(bareName(key)).toBe(expected);
  });
});

describe("qualifierOf", () => {
  it.each([
    ["c.latitude", "c"],
    ["latitude", ""],
    ["a.b.c", "a.b"],
    ["", ""],
  ])("%s -> %s", (key, expected) => {
    expect(qualifierOf(key)).toBe(expected);
  });
});

describe("findColumn", () => {
  const TASK = /^(task|name|label|title)$/i;

  // An unqualified key IS its own bare name, so every existing dashboard
  // resolves exactly as it did against an anchored whole-key match.
  it("matches an unqualified column as before", () => {
    expect(findColumn(["task", "start"], TASK)).toBe("task");
    expect(findColumn(["Task"], TASK)).toBe("Task");
  });

  // #1925: the whole point. `RETURN m.title, m.released` named the column
  // "m.title", which an anchored match rejected, so every chart that resolves
  // by name fell back to column position.
  it("matches a qualified column on its bare name", () => {
    expect(findColumn(["m.title", "m.released"], TASK)).toBe("m.title");
  });

  it("returns the full key, never the bare name", () => {
    expect(findColumn(["m.title"], TASK)).toBe("m.title");
  });

  // Two nodes, same property. Collapsing them would plot one row's value
  // against another row's label.
  it("does not collapse two qualified columns sharing a bare name", () => {
    const keys = ["a.name", "b.name"];
    const first = findColumn(keys, TASK);
    const second = findColumn(keys, TASK, [first]);
    expect(first).toBe("a.name");
    expect(second).toBe("b.name");
  });

  it("skips excluded keys, including undefined entries", () => {
    expect(findColumn(["name", "title"], TASK, ["name"])).toBe("title");
    expect(findColumn(["name", "title"], TASK, [undefined])).toBe("name");
  });

  it("is undefined when nothing matches", () => {
    expect(findColumn(["a", "b"], TASK)).toBeUndefined();
    expect(findColumn([], TASK)).toBeUndefined();
  });

  it("still refuses a qualified near-miss", () => {
    // The reason map matched the last segment rather than a loose substring.
    expect(findColumn(["c.population"], /^(lat|latitude)$/i)).toBeUndefined();
  });

  it("carries an unanchored pattern through to the bare name", () => {
    // Sankey matches loosely on purpose; the bare name keeps that working for
    // a qualified column without widening what it matches.
    expect(findColumn(["r.source_node"], /source|from/i)).toBe("r.source_node");
  });
});
