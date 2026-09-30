import { describe, it, expect } from "vitest";
import { seedRowToOption } from "../seed-option";

const node = {
  $type: "node",
  identity: 1,
  elementId: "4:m:1",
  labels: ["Movie"],
  properties: { title: "Heat" },
};

// #2104: the selector and the Test Seed Query preview both read rows here.
describe("seedRowToOption", () => {
  it.each([
    ["named value first", { value: 7, label: "Heat" }, "7", "Heat", 7],
    ["named label first", { label: "Heat", value: 7 }, "7", "Heat", 7],
    ["column position", { id: 42, name: "Carol" }, "42", "Carol", 42],
    ["a single column", { year: 1999 }, "1999", "1999", 1999],
    ["a primitive row", "alpha", "alpha", "alpha", "alpha"],
    ["a node as its elementId", { m: node }, "4:m:1", "4:m:1", "4:m:1"],
    [
      "a map as its JSON text",
      { m: { a: 1 } },
      '{"a":1}',
      '{"a":1}',
      '{"a":1}',
    ],
  ])("reads %s", (_case, row, value, label, rawValue) => {
    expect(seedRowToOption(row)).toEqual({ value, label, rawValue });
  });
});
