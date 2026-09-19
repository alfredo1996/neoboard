import { types as pgTypes } from "pg";
import {
  buildShapeConformanceCases,
  type ShapeFixtures,
} from "@neoboard/connector-sdk";
import { PostgresRecordParser } from "../../src/postgresql/PostgresRecordParser";
import { postgresDescriptor } from "../../src/postgresql/descriptor";

/**
 * The SDK's pure shape conformance over the tabular parser (#1904): values as
 * node-pg hands them over, no container. Parsing here depends on the column's
 * type OID, so a raw fixture is the value plus its OID.
 */

const OID = {
  bool: 16,
  int8: 20,
  text: 25,
  json: 114,
  float8: 701,
  date: 1082,
  time: 1083,
  timestamp: 1114,
  timestamptz: 1184,
  interval: 1186,
  timetz: 1266,
  numeric: 1700,
} as const;

interface Raw {
  value: unknown;
  oid: number;
}

const parser = new PostgresRecordParser();

const parse = ({ value, oid }: Raw): unknown =>
  parser.bulkParse([{ v: value }], [{ name: "v", dataTypeID: oid }])[0].v;

/** An interval exactly as node-pg delivers it: pg's own parser over wire text. */
const interval = (text: string): Raw => ({
  value: pgTypes.getTypeParser(OID.interval)(text),
  oid: OID.interval,
});

const fixtures: ShapeFixtures<Raw> = {
  safeInteger: [
    { raw: { value: "42", oid: OID.int8 }, expected: 42 },
    { raw: { value: 42n, oid: OID.int8 }, expected: 42 },
  ],
  unsafeInteger: [
    {
      raw: { value: "9007199254740993", oid: OID.int8 },
      expected: "9007199254740993",
    },
    // Only a custom type parser yields a BigInt; JSON.stringify throws on one.
    {
      raw: { value: 9007199254740993n, oid: OID.int8 },
      expected: "9007199254740993",
    },
  ],
  decimal: {
    raw: { value: "0.12345678901234567890", oid: OID.numeric },
    expected: "0.12345678901234567890",
  },
  float: { raw: { value: 1.5, oid: OID.float8 }, expected: 1.5 },
  boolean: { raw: { value: true, oid: OID.bool }, expected: true },
  nullish: [
    { raw: { value: null, oid: OID.text }, expected: null },
    { raw: { value: undefined, oid: OID.text }, expected: null },
  ],
  nested: {
    raw: {
      value: { ids: [1, 2], when: new Date("2024-06-01T12:30:05.123Z") },
      oid: OID.json,
    },
    expected: { ids: [1, 2], when: "2024-06-01T12:30:05.123Z" },
  },
  date: {
    raw: { value: new Date(2024, 5, 1), oid: OID.date },
    expected: "2024-06-01",
  },
  dateTime: {
    raw: { value: new Date("2024-06-01T12:30:05.123Z"), oid: OID.timestamptz },
    expected: "2024-06-01T12:30:05.123Z",
  },
  localDateTime: {
    // node-pg builds a `timestamp` from LOCAL components.
    raw: { value: new Date(2024, 5, 1, 10, 30, 5, 123), oid: OID.timestamp },
    expected: "2024-06-01T10:30:05.123",
  },
  time: [
    // The server omits the offset's minutes when they are zero.
    {
      raw: { value: "10:30:00+02", oid: OID.timetz },
      expected: "10:30:00+02:00",
    },
    {
      raw: { value: "10:30:00.5-05:30", oid: OID.timetz },
      expected: "10:30:00.5-05:30",
    },
  ],
  localTime: {
    raw: { value: "12:05:03.0004", oid: OID.time },
    expected: "12:05:03.0004",
  },
  duration: [
    {
      raw: interval("1 year 2 mons 3 days 04:05:06.5"),
      expected: "P1Y2M3DT4H5M6.5S",
    },
    { raw: interval("1 mon 2 days 00:00:03"), expected: "P1M2DT3S" },
    { raw: interval("00:00:00"), expected: "PT0S" },
    {
      raw: interval("-1 years -2 mons +3 days -04:05:06"),
      expected: "P-1Y-2M3DT-4H-5M-6S",
    },
    { raw: interval("-1 days +02:00:00"), expected: "P-1DT2H" },
    { raw: interval("00:00:00.000001"), expected: "PT0.000001S" },
    { raw: interval("-00:00:01.5"), expected: "PT-1.5S" },
    { raw: interval("40 days"), expected: "P40D" },
    { raw: interval("25:00:00"), expected: "PT25H" },
  ],
};

describe("tabular parser — result-shape conformance (#1904)", () => {
  const cases = buildShapeConformanceCases(parse, fixtures, {
    supportsGraphData: postgresDescriptor.supportsGraphData,
  });

  it("runs every kind this database has, and no graph kind", () => {
    // A case-count guard: a dropped fixture would otherwise pass in silence.
    expect(cases.map((c) => c.name)).toEqual([
      "safeInteger",
      "unsafeInteger",
      "float",
      "boolean",
      "nullish",
      "nested",
      "decimal",
      "date",
      "dateTime",
      "localDateTime",
      "time",
      "localTime",
      "duration",
    ]);
  });

  test.each(cases)("$name", ({ run }) => {
    expect(run).not.toThrow();
  });
});

describe("tabular parser — timestamps (#1904)", () => {
  const original = process.env.TZ;
  afterEach(() => {
    if (original === undefined) delete process.env.TZ;
    else process.env.TZ = original;
  });

  it("keeps a timestamp WITHOUT zone zone-less, in any server zone", () => {
    // The same stored wall clock, as node-pg would build it under two server
    // zones. Serialising the Date instead moved it by the server's offset —
    // the defect #1306 fixed for the identical concept on the graph side.
    for (const zone of ["UTC", "Pacific/Kiritimati", "America/New_York"]) {
      process.env.TZ = zone;
      const built = new Date(2024, 2, 15, 10, 30, 0, 0);
      expect(parse({ value: built, oid: OID.timestamp })).toBe(
        "2024-03-15T10:30:00.000",
      );
    }
  });

  it("emits a timestamptz as the same instant in any server zone", () => {
    for (const zone of ["UTC", "Pacific/Kiritimati"]) {
      process.env.TZ = zone;
      expect(
        parse({
          value: new Date("2024-03-15T10:30:00.000Z"),
          oid: OID.timestamptz,
        }),
      ).toBe("2024-03-15T10:30:00.000Z");
    }
  });

  it("converts every element of a timestamp[] and a timestamptz[]", () => {
    expect(
      parse({ value: [new Date(2024, 2, 15, 10, 30), null], oid: 1115 }),
    ).toEqual(["2024-03-15T10:30:00.000", null]);
    expect(
      parse({ value: [new Date("2024-03-15T10:30:00.000Z")], oid: 1185 }),
    ).toEqual(["2024-03-15T10:30:00.000Z"]);
  });

  it("reads a Date with no column type as an instant", () => {
    expect(
      parser.bulkParse([{ at: new Date("2024-03-15T10:30:00Z") }])[0].at,
    ).toBe("2024-03-15T10:30:00.000Z");
  });

  it("does not throw on an invalid Date, which toISOString() would", () => {
    expect(
      parse({ value: new Date(Number.NaN), oid: OID.timestamptz }),
    ).toBeNull();
    expect(
      parse({ value: new Date(Number.NaN), oid: OID.timestamp }),
    ).toBeNull();
  });

  it("leaves 'infinity', which node-pg delivers as a number, alone", () => {
    expect(parse({ value: Number.POSITIVE_INFINITY, oid: OID.timestamp })).toBe(
      Number.POSITIVE_INFINITY,
    );
  });
});
