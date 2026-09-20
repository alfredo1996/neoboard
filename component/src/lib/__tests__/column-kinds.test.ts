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

  // #1925: a connector returns a number it cannot hold in a double as a
  // decimal string. The column is numeric; the string is how precision
  // survives the wire, not a signal that the value is text.
  it("calls a column of numeric strings numeric", () => {
    expect(inferColumnKind(["9", "10", "100"])).toBe("numeric");
    expect(inferColumnKind(["48210.50", "-3.5", "+7"])).toBe("numeric");
  });

  it("calls a column mixing numbers and numeric strings numeric", () => {
    expect(inferColumnKind([12, "9007199254740993", null, "7"])).toBe(
      "numeric",
    );
  });

  it("still calls a genuinely mixed column text", () => {
    expect(inferColumnKind([1, 2, "n/a", 4])).toBe("text");
    expect(inferColumnKind(["n/a", 1, 2, 3])).toBe("text");
  });

  // Temporals cross the wire as ISO-8601 strings (#1904). A Date never
  // arrives — rows go through JSON — so the kind has to be read from the text.
  it("calls a column of ISO dates and date-times datetime", () => {
    expect(inferColumnKind(["2026-09-01", "2026-09-02"])).toBe("datetime");
    expect(
      inferColumnKind(["2026-09-01T10:15:00.000Z", "2026-09-02T00:00:00Z"]),
    ).toBe("datetime");
    expect(inferColumnKind([null, "2026-09-01T10:15:00+02:00"])).toBe(
      "datetime",
    );
    expect(inferColumnKind(["2026-03-15T10:30:00"])).toBe("datetime");
  });

  it("does not call a duration or a bare year a temporal", () => {
    // An ISO-8601 duration is a length, not a point in time, and nothing reads
    // one (#1925): it stays text so it renders and sorts as what it is.
    expect(inferColumnKind(["P1M2DT3S", "PT0S"])).toBe("text");
    // A bare year is a category; treating it as a date is what #1419 hit.
    expect(inferColumnKind([1999, 2000])).toBe("numeric");
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

  // A double cannot tell 9007199254740992 and …3 apart, so `basic` — which
  // subtracts them as numbers — reports them equal and the column mis-sorts.
  it("orders numeric strings past 2^53 by their digits", () => {
    const cmp = sortingFnForKind("numeric");
    const a = row("9007199254740992");
    const b = row("9007199254740993");
    expect(cmp(a, b, "c")).toBeLessThan(0);
    expect(cmp(b, a, "c")).toBeGreaterThan(0);
  });

  it("orders a numeric-string column numerically, not alphanumerically", () => {
    const cmp = sortingFnForKind("numeric");
    expect(cmp(row("9"), row("10"), "c")).toBeLessThan(0);
    expect(cmp(row("-10"), row("-9"), "c")).toBeLessThan(0);
  });

  // Asserted by behaviour, not identity: numeric no longer IS
  // `sortingFns.basic`, because that one subtracts doubles (#1925).
  it("orders plain numbers ascending", () => {
    const cmp = sortingFnForKind("numeric");
    expect(cmp(row(9), row(10), "c")).toBeLessThan(0);
    expect(cmp(row(10), row(9), "c")).toBeGreaterThan(0);
    expect(cmp(row(9), row(9), "c")).toBe(0);
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
    expect(
      sortDescFirstForKind(inferColumnKind([null, "2026-09-01T00:00:00Z"])),
    ).toBe(true);
    expect(sortDescFirstForKind(inferColumnKind([null, "b", "a"]))).toBe(false);
    expect(sortDescFirstForKind("empty")).toBe(false);
  });
});
