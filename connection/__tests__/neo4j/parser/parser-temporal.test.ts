import { Neo4jRecordParser } from "../../../src/neo4j/Neo4jRecordParser";
import neo4j from "neo4j-driver";

const { int } = neo4j;

/** Helper to build a fake Neo4j record for the parser. */
function fakeRecord(key: string, value: unknown) {
  return {
    keys: [key],
    get: (k: string) => (k === key ? value : undefined),
  } as any;
}

describe("Neo4jRecordParser - Temporal Conversion", () => {
  const parser = new Neo4jRecordParser();

  it('converts Neo4jDate to "YYYY-MM-DD" string', () => {
    const date = new neo4j.types.Date(int(2024), int(3), int(15));
    const result = parser._parse(fakeRecord("d", date));
    expect(result["d"]).toBe("2024-03-15");
  });

  it("pads single-digit month and day in Neo4jDate", () => {
    const date = new neo4j.types.Date(int(2024), int(1), int(9));
    const result = parser._parse(fakeRecord("d", date));
    expect(result["d"]).toBe("2024-01-09");
  });

  it('converts DateTime to "YYYY-MM-DD HH:mm:ss" string', () => {
    const dt = new neo4j.types.DateTime(
      int(2024),
      int(6),
      int(1),
      int(14),
      int(30),
      int(5),
      int(123456789),
      int(3600), // +01:00 offset
    );
    const result = parser._parse(fakeRecord("dt", dt));
    // Lossless ISO-8601. The old form dropped BOTH the offset and every
    // sub-second digit, so two rows recorded at genuinely different instants
    // rendered identically (#1306).
    expect(result["dt"]).toBe("2024-06-01T14:30:05.123456789+01:00");
  });

  it("pads single-digit hour/minute/second in DateTime", () => {
    const dt = new neo4j.types.DateTime(
      int(2024),
      int(1),
      int(2),
      int(3),
      int(4),
      int(5),
      int(0),
      int(0),
    );
    const result = parser._parse(fakeRecord("dt", dt));
    // The driver omits the fractional part when nanoseconds are zero.
    expect(result["dt"]).toBe("2024-01-02T03:04:05Z");
  });

  it("returns no {low, high} sub-objects in Neo4jDate output", () => {
    const date = new neo4j.types.Date(int(2024), int(12), int(25));
    const result = parser._parse(fakeRecord("d", date));
    const val = result["d"];
    expect(typeof val).toBe("string");
    expect(val).not.toHaveProperty("low");
  });

  it("returns no {low, high} sub-objects in DateTime output", () => {
    const dt = new neo4j.types.DateTime(
      int(2024),
      int(12),
      int(25),
      int(10),
      int(30),
      int(0),
      int(0),
      int(0),
    );
    const result = parser._parse(fakeRecord("dt", dt));
    const val = result["dt"];
    expect(typeof val).toBe("string");
    expect(val).not.toHaveProperty("low");
  });

  it("still converts LocalDateTime to JS Date (regression guard)", () => {
    const ldt = new neo4j.types.LocalDateTime(
      int(2024),
      int(3),
      int(15),
      int(10),
      int(30),
      int(0),
      int(0),
    );
    const result = parser._parse(fakeRecord("ldt", ldt));
    // A LocalDateTime has NO zone. Returning a Date made it an absolute
    // instant in the server process's timezone, so the same value displayed
    // differently depending on where the server ran (#1306).
    expect(typeof result["ldt"]).toBe("string");
    expect(result["ldt"]).toBe("2024-03-15T10:30:00");
  });
});

describe("parseTemporal precision and zone-independence (#1306)", () => {
  const parser = new Neo4jRecordParser();

  it("renders LocalTime nanoseconds as nanoseconds, not milliseconds", () => {
    // 400 NANOseconds. The old branch emitted "12:5:3.400", which reads as
    // 400 milliseconds — a 10^6 error on any value under 10^8 ns, i.e. ~10%
    // of all times. The missing padding also broke lexicographic sort.
    const lt = new neo4j.types.LocalTime(int(12), int(5), int(3), int(400));
    const result = parser._parse(fakeRecord("lt", lt));
    expect(result["lt"]).toBe("12:05:03.000000400");
  });

  it("renders LocalDateTime identically regardless of the host timezone", () => {
    // The value is zone-less by definition. Under the old Date-based branch
    // these two runs disagreed by 14 hours once serialized.
    const ldt = new neo4j.types.LocalDateTime(
      int(2024),
      int(3),
      int(15),
      int(10),
      int(30),
      int(0),
      int(0),
    );
    const original = process.env.TZ;
    try {
      process.env.TZ = "UTC";
      const utc = parser._parse(fakeRecord("ldt", ldt))["ldt"];
      process.env.TZ = "Pacific/Kiritimati"; // UTC+14
      const plus14 = parser._parse(fakeRecord("ldt", ldt))["ldt"];
      expect(utc).toBe(plus14);
      expect(utc).toBe("2024-03-15T10:30:00");
    } finally {
      if (original === undefined) delete process.env.TZ;
      else process.env.TZ = original;
    }
  });
});
