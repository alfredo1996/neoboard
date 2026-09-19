import neo4j from "neo4j-driver";
import {
  buildShapeConformanceCases,
  type ShapeFixtures,
} from "@neoboard/connector-sdk";
import { Neo4jRecordParser } from "../../src/neo4j/Neo4jRecordParser";
import { neo4jDescriptor } from "../../src/neo4j/descriptor";

/**
 * The SDK's pure shape conformance over the graph parser (#1904): driver
 * values built by hand, no container. The Docker-backed suites under
 * `__tests__/neo4j/parser/` prove the same forms against a real server.
 */

const { int, types } = neo4j;
const parser = new Neo4jRecordParser();

/** One value through the real record path: a driver Record in, a row out. */
const parse = (raw: unknown): unknown =>
  parser.bulkParse([
    new types.Record(["v"], [raw]) as unknown as Record<string, unknown>,
  ])[0].v;

const alice = new types.Node(
  int(1),
  ["Person"],
  { age: int(30), id: int("9007199254740993") },
  "4:db:1",
);
const bob = new types.Node(int(2), ["Person"], {}, "4:db:2");
const knows = new types.Relationship(
  int(10),
  int(1),
  int(2),
  "KNOWS",
  { since: int(1999) },
  "5:db:10",
  "4:db:1",
  "4:db:2",
);

const aliceRow = {
  $type: "node" as const,
  identity: 1,
  elementId: "4:db:1",
  labels: ["Person"],
  properties: { age: 30, id: "9007199254740993" },
};
const bobRow = {
  $type: "node" as const,
  identity: 2,
  elementId: "4:db:2",
  labels: ["Person"],
  properties: {},
};
const knowsRow = {
  $type: "relationship" as const,
  identity: 10,
  elementId: "5:db:10",
  start: 1,
  startNodeElementId: "4:db:1",
  end: 2,
  endNodeElementId: "4:db:2",
  type: "KNOWS",
  properties: { since: 1999 },
};

const duration = (
  months: number,
  days: number,
  seconds: number,
  nanoseconds: number,
) => new types.Duration(int(months), int(days), int(seconds), int(nanoseconds));

const fixtures: ShapeFixtures = {
  safeInteger: [
    { raw: int(42), expected: 42 },
    { raw: 42n, expected: 42 },
  ],
  unsafeInteger: [
    { raw: int("9007199254740993"), expected: "9007199254740993" },
    { raw: int("-9223372036854775808"), expected: "-9223372036854775808" },
    // A driver configured with useBigInt hands over a BigInt, on which
    // JSON.stringify throws — the whole query would fail with an opaque 500.
    { raw: 9007199254740993n, expected: "9007199254740993" },
  ],
  float: { raw: 1.5, expected: 1.5 },
  boolean: { raw: true, expected: true },
  nullish: [
    { raw: null, expected: null },
    { raw: undefined, expected: null },
  ],
  nested: {
    raw: [
      { ids: [int(1), int("9007199254740993"), 7n], missing: undefined },
      new types.Point(int(4326), 9.19, 45.46),
    ],
    expected: [
      { ids: [1, "9007199254740993", 7], missing: null },
      { srid: 4326, x: 9.19, y: 45.46 },
    ],
  },
  date: {
    raw: new types.Date(int(2024), int(6), int(1)),
    expected: "2024-06-01",
  },
  dateTime: [
    {
      raw: new types.DateTime(
        int(2024),
        int(6),
        int(1),
        int(14),
        int(30),
        int(5),
        int(123456789),
        int(7200),
      ),
      expected: "2024-06-01T14:30:05.123456789+02:00",
    },
    {
      // A named zone is dropped, its offset kept (#1651).
      raw: new types.DateTime(
        int(2024),
        int(6),
        int(1),
        int(14),
        int(30),
        int(5),
        int(0),
        int(7200),
        "Europe/Rome",
      ),
      expected: "2024-06-01T14:30:05+02:00",
    },
  ],
  localDateTime: {
    raw: new types.LocalDateTime(
      int(2024),
      int(3),
      int(15),
      int(10),
      int(30),
      int(0),
      int(0),
    ),
    expected: "2024-03-15T10:30:00",
  },
  time: {
    raw: new types.Time(int(12), int(5), int(3), int(400), int(-19800)),
    expected: "12:05:03.000000400-05:30",
  },
  localTime: {
    raw: new types.LocalTime(int(12), int(5), int(3), int(400)),
    expected: "12:05:03.000000400",
  },
  duration: [
    { raw: duration(14, 3, 3723, 500_000_000), expected: "P1Y2M3DT1H2M3.5S" },
    { raw: duration(0, 0, 0, 0), expected: "PT0S" },
    { raw: duration(-14, -3, -3723, 0), expected: "P-1Y-2M-3DT-1H-2M-3S" },
    { raw: duration(1, -2, 3, 0), expected: "P1M-2DT3S" },
    // The driver keeps nanoseconds non-negative: −1.5 s is −2 s + 0.5 s.
    { raw: duration(0, 0, -2, 500_000_000), expected: "PT-1.5S" },
    { raw: duration(0, 0, 0, 1), expected: "PT0.000000001S" },
    {
      // Beyond the safe range: toNumber() would have rounded the seconds.
      raw: new types.Duration(int(0), int(0), int("9007199254740993"), int(0)),
      expected: "PT2501999792983H36M33S",
    },
  ],
  node: { raw: alice, expected: aliceRow },
  relationship: { raw: knows, expected: knowsRow },
  relationshipWithoutEndpoints: {
    raw: new types.UnboundRelationship(
      int(7),
      "KNOWS",
      { since: int(1999) },
      "5:db:7",
    ),
    expected: {
      $type: "relationship",
      identity: 7,
      elementId: "5:db:7",
      type: "KNOWS",
      properties: { since: 1999 },
    },
  },
  path: [
    {
      raw: new types.Path(alice, bob, [
        new types.PathSegment(alice, knows, bob),
      ]),
      expected: {
        $type: "path",
        start: aliceRow,
        end: bobRow,
        segments: [{ start: aliceRow, relationship: knowsRow, end: bobRow }],
        length: 1,
      },
    },
    {
      // A zero-length path: one node, no segments.
      raw: new types.Path(alice, alice, []),
      expected: {
        $type: "path",
        start: aliceRow,
        end: aliceRow,
        segments: [],
        length: 0,
      },
    },
  ],
};

describe("graph parser — result-shape conformance (#1904)", () => {
  const cases = buildShapeConformanceCases(parse, fixtures, {
    supportsGraphData: neo4jDescriptor.supportsGraphData,
  });

  it("runs every kind this database has, the graph kinds included", () => {
    // A case-count guard: a dropped fixture would otherwise pass in silence.
    expect(cases.map((c) => c.name)).toEqual([
      "safeInteger",
      "unsafeInteger",
      "float",
      "boolean",
      "nullish",
      "nested",
      "date",
      "dateTime",
      "localDateTime",
      "time",
      "localTime",
      "duration",
      "node",
      "relationship",
      "relationshipWithoutEndpoints",
      "path",
    ]);
  });

  test.each(cases)("$name", ({ run }) => {
    expect(run).not.toThrow();
  });

  it("returns rows as plain objects whose keys are the columns", () => {
    // The Proxy this replaced had no ownKeys trap: Object.keys(row) was
    // ["record"], so nothing in-process could enumerate a row's columns.
    const [row] = parser.bulkParse([
      new types.Record(["a", "b"], [int(1), "x"]) as unknown as Record<
        string,
        unknown
      >,
    ]);
    expect(Object.keys(row)).toEqual(["a", "b"]);
    expect(Object.getPrototypeOf(row)).toBe(Object.prototype);
    expect(row).toEqual({ a: 1, b: "x" });
  });
});
