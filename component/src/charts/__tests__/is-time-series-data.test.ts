import { describe, it, expect } from "vitest";
import { isTimeSeriesData } from "../chart-utils";

/**
 * `isTimeSeriesData` decides whether a chart gets a time axis or a category
 * axis, and it had no tests at all.
 *
 * The cases below are the shapes the connectors really produce, not tidy ones:
 * Neo4j hands a `date` over as 'YYYY-MM-DD' and a `localdatetime` as a
 * zone-less ISO string, node-pg returns NUMERIC as a string, and a zoned
 * `datetime` used to arrive with a bracketed zone id that `new Date()` rejects
 * outright (#1651, #1636).
 */
describe("isTimeSeriesData", () => {
  it.each([
    ["Neo4j date", ["2024-06-01", "2024-06-02"]],
    ["Neo4j localdatetime", ["2024-06-01T14:30:00", "2024-06-02T14:30:00"]],
    ["DateTime with an offset", ["2024-06-01T14:30:05+02:00"]],
    ["DateTime in UTC", ["2024-06-01T12:30:05Z"]],
    ["epoch milliseconds", [1717245005000, 1717331405000]],
  ])("recognises %s", (_name, values) => {
    expect(isTimeSeriesData(values)).toBe(true);
  });

  it("recognises a zoned datetime once the parser resolves its offset", () => {
    // The connector used to emit "2024-06-01T14:30:05+02:00[Europe/Rome]".
    // `new Date()` returns Invalid Date on that, so a column of perfectly good
    // timestamps got a category axis — evenly spaced labels, no time scaling,
    // and nothing to say so.
    expect(isTimeSeriesData(["2024-06-01T14:30:05+02:00[Europe/Rome]"])).toBe(
      false,
    );
    expect(isTimeSeriesData(["2024-06-01T14:30:05+02:00"])).toBe(true);
  });

  it.each([
    ["a year column", [1999, 2001, 2003]],
    ["plain labels", ["Electronics", "Home"]],
    ["an empty result", []],
    ["nulls", [null, null]],
  ])("does not mistake %s for time", (_name, values) => {
    expect(isTimeSeriesData(values)).toBe(false);
  });

  it("requires every sampled value to be a date, not just the first", () => {
    expect(isTimeSeriesData(["2024-06-01", "Home", "2024-06-03"])).toBe(false);
  });
});
