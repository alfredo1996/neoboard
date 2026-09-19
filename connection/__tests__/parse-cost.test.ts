import neo4j from "neo4j-driver";
import { Neo4jRecordParser } from "../src/neo4j/Neo4jRecordParser";
import { PostgresRecordParser } from "../src/postgresql/PostgresRecordParser";

/**
 * What canonicalising a full result costs (#1904).
 *
 * Both parsers normalise inside the single `bulkParse` pass, and 100 000 rows
 * is the most a connection may retain. There is no per-row benchmark yet
 * (#1688), so this logs the time and asserts a ceiling generous enough for a
 * loaded CI runner with coverage on: it exists to make a second pass over the
 * rows, or a per-row allocation that should be per-query, visible — not to
 * police milliseconds.
 */
const ROWS = 100_000;
const CEILING_MS = 15_000;

const { Node, Record: DriverRecord, DateTime, Duration } = neo4j.types;
const { int } = neo4j;

function timed<T>(label: string, run: () => T): T {
  const start = performance.now();
  const result = run();
  const ms = performance.now() - start;
  console.info(`[parse-cost] ${label}: ${ROWS} rows in ${ms.toFixed(0)} ms`);
  expect(ms).toBeLessThan(CEILING_MS);
  return result;
}

describe(`parsing ${ROWS} rows`, () => {
  it("graph rows: a node, an integer, a date-time, a duration, a list", () => {
    const keys = ["n", "id", "at", "took", "tags"];
    const records = Array.from({ length: ROWS }, (_, i) => {
      const node = new Node(
        int(i),
        ["Person"],
        {
          name: `p${i}`,
          age: int(30),
          born: new neo4j.types.Date(int(1990), int(1), int(1)),
        },
        `4:db:${i}`,
      );
      return new DriverRecord(keys, [
        node,
        int(i),
        new DateTime(
          int(2024),
          int(6),
          int(1),
          int(14),
          int(30),
          int(5),
          int(0),
          int(7200),
        ),
        new Duration(int(1), int(2), int(3), int(0)),
        ["a", "b"],
      ]);
    }) as unknown as Record<string, unknown>[];

    const rows = timed("graph", () =>
      new Neo4jRecordParser().bulkParse(records),
    );
    expect(rows).toHaveLength(ROWS);
  });

  it("tabular rows: int8, numeric, timestamptz, date, interval-free text, an array", () => {
    const fields = [
      { name: "id", dataTypeID: 20 },
      { name: "total", dataTypeID: 1700 },
      { name: "name", dataTypeID: 25 },
      { name: "created", dataTypeID: 1184 },
      { name: "day", dataTypeID: 1082 },
      { name: "tags", dataTypeID: 1009 },
    ];
    const records = Array.from({ length: ROWS }, (_, i) => ({
      id: String(i),
      total: "12.50",
      name: `row ${i}`,
      created: new Date(1717245005000 + i),
      day: new Date(2024, 5, 1),
      tags: ["a", "b"],
    }));

    const rows = timed("tabular", () =>
      new PostgresRecordParser().bulkParse(records, fields),
    );
    expect(rows).toHaveLength(ROWS);
  });
});
