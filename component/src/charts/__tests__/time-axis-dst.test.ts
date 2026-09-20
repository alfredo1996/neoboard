/**
 * #1925: `normalizeValue` used to turn a Date into `"YYYY-MM-DD HH:mm:ss"`,
 * and `isTimeSeriesData` re-parses that space-separated form as LOCAL time
 * while the value it came from was UTC. Temporals now cross the wire as
 * ISO-8601 with their zone intact, so the round trip is lossless wherever the
 * viewer sits — including across a DST boundary, where a local re-parse shifts
 * by an hour or lands in a gap that does not exist.
 */
import { describe, it, expect, afterEach } from "vitest";
import { isTimeSeriesData } from "../chart-utils";

const originalTz = process.env.TZ;
afterEach(() => {
  process.env.TZ = originalTz;
});

describe("isTimeSeriesData across a DST boundary", () => {
  const springForward = [
    "2026-03-29T00:30:00.000Z",
    "2026-03-29T01:30:00.000Z",
    "2026-03-29T02:30:00.000Z",
  ];

  it.each(["UTC", "Europe/Rome", "America/New_York", "Pacific/Kiritimati"])(
    "reads UTC ISO instants as time in %s",
    (tz) => {
      process.env.TZ = tz;
      expect(isTimeSeriesData(springForward)).toBe(true);
      // The instants stay distinct and ordered whatever the viewer's zone.
      const ms = springForward.map((s) => new Date(s).getTime());
      expect(new Set(ms).size).toBe(3);
      expect([...ms].sort((a, b) => a - b)).toEqual(ms);
    },
  );

  it("does not read a duration or a bare year as time", () => {
    expect(isTimeSeriesData(["P1M2DT3S", "PT0S"])).toBe(false);
    expect(isTimeSeriesData([1999, 2000])).toBe(false);
  });

  it("reads an offset-bearing ISO string as time", () => {
    expect(isTimeSeriesData(["2026-09-01T10:15:00+02:00"])).toBe(true);
  });
});
