import { describe, it, expect } from "vitest";
import { transformToGanttData, validateGanttData } from "../../gantt/transform";

/**
 * Dates for the gantt (#1616).
 *
 * The expected values are built with `new Date(y, m - 1, d)` rather than a
 * literal epoch number, so these assertions hold on a UTC CI runner and on a
 * laptop in any zone. Setting `process.env.TZ` inside a test is unreliable
 * once `Date` has been touched.
 */
const rows = (...items: Record<string, unknown>[]) => items;
const item = (out: unknown, i = 0) =>
  (out as Record<string, unknown>[])[i] ?? undefined;

describe("transformToGanttData — parsing dates", () => {
  it("reads a date-only string as local midnight, not UTC", () => {
    const out = transformToGanttData(
      rows({ task: "Design", start: "2026-04-01", end: "2026-04-03" }),
    );

    // Neo4j hands a `date` property over as 'YYYY-MM-DD', which Date.parse
    // resolves to UTC midnight — a day early everywhere west of UTC.
    expect(item(out)?.start).toBe(new Date(2026, 3, 1).getTime());
    expect(item(out)?.end).toBe(new Date(2026, 3, 3).getTime());
  });

  it("leaves an ISO datetime alone", () => {
    const iso = "2026-04-01T10:00:00Z";
    const out = transformToGanttData(
      rows({ task: "A", start: iso, end: "2026-04-01T12:00:00Z" }),
    );
    expect(item(out)?.start).toBe(Date.parse(iso));
  });

  it("leaves a Date instance alone", () => {
    const d = new Date(2026, 3, 1, 9, 30);
    const out = transformToGanttData(
      rows({ task: "A", start: d, end: new Date(2026, 3, 2) }),
    );
    expect(item(out)?.start).toBe(d.getTime());
  });

  it("drops a year column instead of drawing bars in 1970", () => {
    // 1999 * 1000 ms is 1970-01-01T00:33Z — a cluster of invisible bars.
    const out = transformToGanttData(
      rows({ task: "The Matrix", start: 1999, end: 2001 }),
    );
    expect(out).toEqual([]);
  });

  it("still treats a Unix seconds value as seconds", () => {
    const out = transformToGanttData(
      rows({ task: "A", start: 1.7e9, end: 1.7e9 + 60 }),
    );
    expect(item(out)?.start).toBe(1.7e9 * 1000);
  });

  it("still treats a millisecond timestamp as milliseconds", () => {
    const out = transformToGanttData(
      rows({ task: "A", start: 1.7e12, end: 1.7e12 + 1 }),
    );
    expect(item(out)?.start).toBe(1.7e12);
  });

  it("applies the same rule to a numeric string", () => {
    const out = transformToGanttData(
      rows({ task: "A", start: "1999", end: "2001" }),
    );
    expect(out).toEqual([]);
  });

  it("drops a row that ends before it starts", () => {
    const out = transformToGanttData(
      rows({ task: "A", start: "2026-04-05", end: "2026-04-01" }),
    );
    expect(out).toEqual([]);
  });

  it("drops an unparseable string", () => {
    const out = transformToGanttData(
      rows({ task: "A", start: "not a date", end: "2026-04-03" }),
    );
    expect(out).toEqual([]);
  });

  it("drops an invalid Date instance", () => {
    const out = transformToGanttData(
      rows({ task: "A", start: new Date("nope"), end: new Date(2026, 3, 3) }),
    );
    expect(out).toEqual([]);
  });

  it("drops a non-finite number", () => {
    const out = transformToGanttData(
      rows({ task: "A", start: Infinity, end: 1.7e12 }),
    );
    expect(out).toEqual([]);
  });

  it("drops a null date", () => {
    const out = transformToGanttData(
      rows({ task: "A", start: null, end: "2026-04-03" }),
    );
    expect(out).toEqual([]);
  });

  it("keeps a zero-duration task", () => {
    const out = transformToGanttData(
      rows({ task: "Launch", start: "2026-04-01", end: "2026-04-01" }),
    );
    expect(item(out)?.start).toBe(item(out)?.end);
  });
});

describe("transformToGanttData — optional columns", () => {
  it("falls back to column position when nothing matches by name", () => {
    // A query naming its columns anything at all still draws, as long as the
    // first three are task, start and end in that order.
    const out = transformToGanttData(
      rows({
        phase_label: "Design",
        kickoff: "2026-04-01",
        wrap: "2026-04-03",
      }),
    );
    expect(item(out)?.task).toBe("Design");
    expect(item(out)?.start).toBe(new Date(2026, 3, 1).getTime());
  });

  it("picks up category and scales a percentage progress into 0-1", () => {
    const out = transformToGanttData(
      rows({
        task: "Design",
        start: "2026-04-01",
        end: "2026-04-03",
        status: "In progress",
        progress: 40,
      }),
    );
    expect(item(out)?.category).toBe("In progress");
    expect(item(out)?.progress).toBe(0.4);
  });

  it("takes a 0-1 progress as it stands and clamps out-of-range values", () => {
    const out = transformToGanttData(
      rows(
        { task: "A", start: "2026-04-01", end: "2026-04-03", progress: 0.25 },
        { task: "B", start: "2026-04-01", end: "2026-04-03", progress: 250 },
        { task: "C", start: "2026-04-01", end: "2026-04-03", progress: -3 },
      ),
    );
    expect(item(out, 0)?.progress).toBe(0.25);
    expect(item(out, 1)?.progress).toBe(1);
    expect(item(out, 2)?.progress).toBe(0);
  });

  it("ignores a progress column that is not a number", () => {
    const out = transformToGanttData(
      rows({
        task: "A",
        start: "2026-04-01",
        end: "2026-04-03",
        progress: "soon",
      }),
    );
    expect(item(out)).not.toHaveProperty("progress");
  });
});

describe("validateGanttData", () => {
  it("passes an empty result through to the empty state", () => {
    expect(validateGanttData([])).toBeNull();
  });

  it("names the columns it got when there are fewer than three", () => {
    const msg = validateGanttData(rows({ task: "A", start: "2026-04-01" }));
    expect(msg).toMatch(/task, start/);
  });

  it("says a year column is not a date when nothing parses", () => {
    const msg = validateGanttData(rows({ task: "A", start: 1999, end: 2001 }));
    expect(msg).toMatch(/year/i);
  });

  it("says so when every row ends before it starts", () => {
    // Otherwise validate passes, the transform then drops every row, and the
    // user is back at "No data" — the exact outcome validate exists to avoid.
    const msg = validateGanttData(
      rows(
        { task: "A", start: "2026-04-05", end: "2026-04-01" },
        { task: "B", start: "2026-05-09", end: "2026-05-02" },
      ),
    );
    expect(msg).toMatch(/before/i);
  });

  it("passes when at least one row is drawable", () => {
    expect(
      validateGanttData(
        rows(
          { task: "A", start: "2026-04-05", end: "2026-04-01" },
          { task: "B", start: "2026-04-01", end: "2026-04-03" },
        ),
      ),
    ).toBeNull();
  });

  it("passes rows it can draw", () => {
    expect(
      validateGanttData(
        rows({ task: "A", start: "2026-04-01", end: "2026-04-03" }),
      ),
    ).toBeNull();
  });
});
