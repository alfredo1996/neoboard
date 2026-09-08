/**
 * inferColumnKind judges a column from ALL of its values (#1662), so the
 * comparator and first-click direction cannot depend on which rows a sample
 * happens to hit — TanStack's own `auto` samples `flatRows.slice(10)`, which
 * is empty for a table of ten rows or fewer.
 */
import { describe, it, expect } from "vitest";
import { sortingFns } from "@tanstack/react-table";
import {
  inferColumnKind,
  sortDescFirstForKind,
  sortingFnForKind,
} from "../column-kinds";

describe("inferColumnKind", () => {
  it("calls a column numeric when every non-null value is a number, however many nulls lead it", () => {
    const tenNullsThenNumbers = [...Array<null>(10).fill(null), 9, 10, 100];
    expect(inferColumnKind(tenNullsThenNumbers)).toBe("numeric");
    expect(inferColumnKind([5])).toBe("numeric");
  });

  it("calls a column of numeric strings text — the value is text, the comparator handles the digits", () => {
    expect(inferColumnKind(["9", "10", "100"])).toBe("text");
  });

  it("calls a mixed column text rather than guessing from its first value", () => {
    expect(inferColumnKind([1, 2, "n/a", 4])).toBe("text");
    expect(inferColumnKind(["n/a", 1, 2, 3])).toBe("text");
  });

  it("calls a column of Dates datetime", () => {
    expect(inferColumnKind([null, new Date(0), new Date(1)])).toBe("datetime");
  });

  it("calls a column with no values empty", () => {
    expect(inferColumnKind([])).toBe("empty");
    expect(inferColumnKind([null, undefined])).toBe("empty");
  });
});

describe("sortingFnForKind", () => {
  const row = (v: unknown) =>
    ({ getValue: () => v }) as unknown as Parameters<
      typeof sortingFns.basic
    >[0];

  it("gives numbers the basic comparator", () => {
    expect(sortingFnForKind("numeric")).toBe(sortingFns.basic);
    expect(sortingFns.basic(row(9), row(10), "c")).toBeLessThan(0);
  });

  it("gives text alphanumeric, so 9 sorts before 10 and apple before Zebra", () => {
    const fn = sortingFnForKind("text");
    expect(fn).toBe(sortingFns.alphanumeric);
    expect(fn(row("9"), row("10"), "c")).toBeLessThan(0);
    expect(fn(row("apple"), row("Zebra"), "c")).toBeLessThan(0);
    // The comparator `auto` falls through to on an empty sample gets both wrong.
    expect(sortingFns.basic(row("9"), row("10"), "c")).toBeGreaterThan(0);
    expect(sortingFns.basic(row("apple"), row("Zebra"), "c")).toBeGreaterThan(
      0,
    );
  });

  it("gives dates the datetime comparator", () => {
    expect(sortingFnForKind("datetime")).toBe(sortingFns.datetime);
  });
});

describe("sortDescFirstForKind", () => {
  it("descends first for numbers and dates, ascends first for text — from the whole column, not row zero", () => {
    expect(sortDescFirstForKind(inferColumnKind([null, null, 3, 1]))).toBe(
      true,
    );
    expect(sortDescFirstForKind(inferColumnKind([null, new Date(0)]))).toBe(
      true,
    );
    expect(sortDescFirstForKind(inferColumnKind([null, "b", "a"]))).toBe(false);
    expect(sortDescFirstForKind("empty")).toBe(false);
  });
});
