import { describe, it, expect } from "vitest";
import { transformToSelectData } from "../transform";

describe("transformToSelectData", () => {
  it("extracts the first column values from an array of records", () => {
    expect(transformToSelectData([{ id: 1 }, { id: 2 }, { id: 3 }])).toEqual([
      1, 2, 3,
    ]);
  });

  it("ignores keys beyond the first column", () => {
    expect(
      transformToSelectData([
        { label: "A", value: 1 },
        { label: "B", value: 2 },
      ]),
    ).toEqual(["A", "B"]);
  });

  it("filters out null and undefined values", () => {
    expect(
      transformToSelectData([
        { id: 1 },
        { id: null },
        { id: 2 },
        { id: undefined },
        { id: 3 },
      ]),
    ).toEqual([1, 2, 3]);
  });

  it("returns an empty array for empty input", () => {
    expect(transformToSelectData([])).toEqual([]);
  });

  it("returns an empty array for null/undefined input", () => {
    expect(transformToSelectData(null)).toEqual([]);
    expect(transformToSelectData(undefined)).toEqual([]);
  });

  it("unwraps PostgreSQL { records } wrapper", () => {
    expect(
      transformToSelectData({
        records: [{ name: "alpha" }, { name: "beta" }],
      }),
    ).toEqual(["alpha", "beta"]);
  });

  it("returns an empty array when the first record has no keys", () => {
    // `Object.keys({})[0]` is undefined — make sure we don't blow up.
    expect(transformToSelectData([{}])).toEqual([]);
  });

  it("preserves duplicate values (no deduplication)", () => {
    expect(transformToSelectData([{ id: 1 }, { id: 1 }, { id: 2 }])).toEqual([
      1, 1, 2,
    ]);
  });

  it("preserves order from the input records", () => {
    expect(transformToSelectData([{ x: "z" }, { x: "a" }, { x: "m" }])).toEqual(
      ["z", "a", "m"],
    );
  });

  it("keeps falsy-but-defined values (0, empty string, false)", () => {
    // Only null/undefined are filtered — 0 and "" are valid select values.
    expect(
      transformToSelectData([{ v: 0 }, { v: "" }, { v: false }, { v: null }]),
    ).toEqual([0, "", false]);
  });

  it("returns an empty array for non-record garbage input", () => {
    expect(transformToSelectData("not records")).toEqual([]);
    expect(transformToSelectData(42)).toEqual([]);
    expect(transformToSelectData({ foo: "bar" })).toEqual([]);
  });
});
