import { PostgresRecordParser } from "../../src/postgresql/PostgresRecordParser";
import { NeodashRecord } from "@neoboard/connector-sdk";

describe("PostgreSQL Record Parser", () => {
  let parser: PostgresRecordParser;

  beforeEach(() => {
    parser = new PostgresRecordParser();
  });

  test("should implement _parse to return NeodashRecord", () => {
    const row = { id: 1, name: "Alice", age: 30 };

    const result = parser["_parse"](row);

    expect(result).toBeInstanceOf(NeodashRecord);
    expect(result.id).toBe(1);
    expect(result.name).toBe("Alice");
    expect(result.age).toBe(30);
  });

  test("renders bytea (Buffer) as \\x hex, not a numeric-keyed object (#MEDIUM)", () => {
    const row = { blob: Buffer.from([0x0a, 0xff, 0x00]) };

    const result = parser["_parse"](row);

    // Old bug flattened the Buffer to {"0":10,"1":255,"2":0}.
    expect(result.blob).toBe("\\x0aff00");
    expect(typeof result.blob).toBe("string");
  });

  test("should implement bulkParse to return array of NeodashRecords", () => {
    const rows = [
      { id: 1, name: "Alice" },
      { id: 2, name: "Bob" },
    ];

    const results = parser.bulkParse(rows);

    expect(Array.isArray(results)).toBe(true);
    expect(results).toHaveLength(2);
    expect(results[0]).toBeInstanceOf(NeodashRecord);
    expect(results[1]).toBeInstanceOf(NeodashRecord);
    expect(results[0].name).toBe("Alice");
    expect(results[1].name).toBe("Bob");
  });

  test("should implement isPrimitive correctly", () => {
    expect(parser["isPrimitive"]("string")).toBe(true);
    expect(parser["isPrimitive"](123)).toBe(true);
    expect(parser["isPrimitive"](true)).toBe(true);
    expect(parser["isPrimitive"](BigInt(123))).toBe(true);
    expect(parser["isPrimitive"](null)).toBe(false);
    expect(parser["isPrimitive"](undefined)).toBe(false);
    expect(parser["isPrimitive"]({})).toBe(false);
    expect(parser["isPrimitive"]([])).toBe(false);
  });

  test("should implement parsePrimitive correctly", () => {
    expect(parser["parsePrimitive"]("test")).toBe("test");
    expect(parser["parsePrimitive"](123)).toBe(123);
    expect(parser["parsePrimitive"](true)).toBe(true);
    expect(parser["parsePrimitive"](BigInt(999))).toBe(BigInt(999));
  });

  test("should implement isTemporal correctly", () => {
    const date = new Date();
    expect(parser["isTemporal"](date)).toBe(true);
    expect(parser["isTemporal"]("2023-01-01")).toBe(false);
    expect(parser["isTemporal"](123)).toBe(false);
    expect(parser["isTemporal"](null)).toBe(false);
  });

  test("should implement parseTemporal correctly", () => {
    const date = new Date("2023-01-01T12:00:00Z");
    const result = parser["parseTemporal"](date);
    expect(result).toBeInstanceOf(Date);
    expect(result).toBe(date);
  });

  test("should inherit default isGraphObject returning false", () => {
    expect(parser["isGraphObject"]({})).toBe(false);
    expect(parser["isGraphObject"]([])).toBe(false);
    expect(parser["isGraphObject"]("string")).toBe(false);
    expect(parser["isGraphObject"](null)).toBe(false);
  });

  test("should inherit default parseGraphObject returning value as is", () => {
    const obj = { key: "value" };
    expect(parser["parseGraphObject"](obj)).toBe(obj);
  });

  test("should handle nested objects in _parse", () => {
    const row = {
      id: 1,
      metadata: { created: new Date(), tags: ["a", "b"] },
      scores: [10, 20, 30],
    };

    const result = parser["_parse"](row);

    expect(result).toBeInstanceOf(NeodashRecord);
    expect(result.id).toBe(1);
    expect(result.metadata).toBeDefined();
    expect(Array.isArray(result.scores)).toBe(true);
  });

  test("should handle null and undefined values", () => {
    const row = { id: 1, name: null, age: undefined };

    const result = parser["_parse"](row);

    expect(result).toBeInstanceOf(NeodashRecord);
    expect(result.id).toBe(1);
    expect(result.name).toBeNull();
    expect(result.age).toBeUndefined();
  });

  test("should return existing NeodashRecord unchanged in _parse", () => {
    const existingRecord = new NeodashRecord({ id: 1, name: "Test" });

    // `any` cast: _parse's signature takes a raw driver row; passing an
    // already-parsed NeodashRecord on purpose to verify the pass-through guard.
    const result = parser["_parse"](existingRecord as any);

    expect(result).toBe(existingRecord);
  });

  // Regression: top-level Date columns (timestamp/timestamptz/date) must
  // survive _parse as usable temporal values, not be flattened to {} by the
  // plain-object branch of _pgToNative. The pg driver returns these as native
  // Date instances. (#1054)
  test("should preserve a top-level Date column instead of flattening to {}", () => {
    const ts = new Date("2025-12-07T00:07:58.104Z");
    const row = { id: 1, created_at: ts };

    const result = parser["_parse"](row);

    expect(result.created_at).toBeInstanceOf(Date);
    expect(result.created_at).toEqual(ts);
    // The real-world symptom: JSON serialization (API boundary) must not be {}.
    expect(JSON.stringify(result.created_at)).toBe(
      '"2025-12-07T00:07:58.104Z"',
    );
  });

  test("should preserve Date instances inside arrays", () => {
    const ts = new Date("2025-12-07T00:07:58.104Z");
    const row = { id: 1, timestamps: [ts] };

    const result = parser["_parse"](row);

    expect(Array.isArray(result.timestamps)).toBe(true);
    expect((result.timestamps as unknown[])[0]).toBeInstanceOf(Date);
  });
});

describe("PostgresRecordParser — numeric promotion and interval (#1307)", () => {
  const parser = new PostgresRecordParser();

  // pg-types registers no parser for OID 20 (int8) or 1700 (numeric), so both
  // arrive as text. SELECT count(*) therefore yielded the STRING "42" on
  // PostgreSQL and the NUMBER 42 on Neo4j for the same logical query.
  const INT8 = 20;
  const NUMERIC = 1700;
  const TEXT = 25;

  const fields = (defs: Array<[string, number]>) =>
    defs.map(([name, dataTypeID]) => ({ name, dataTypeID }));

  it("promotes int8 and numeric text to numbers", () => {
    const [rec] = parser.bulkParse(
      [{ total: "42", amount: "-12.50" }],
      fields([
        ["total", INT8],
        ["amount", NUMERIC],
      ]),
    );
    expect(rec.toObject().total).toBe(42);
    expect(rec.toObject().amount).toBe(-12.5);
  });

  it("leaves a text column alone even when it looks numeric", () => {
    // This is why promotion is gated on the column's OID rather than on the
    // string's shape: a product code of "42" must stay a string.
    const [rec] = parser.bulkParse([{ sku: "42" }], fields([["sku", TEXT]]));
    expect(rec.toObject().sku).toBe("42");
  });

  it("keeps the string when Number() would not round-trip exactly", () => {
    // Same contract as the Neo4j side's inSafeRange() check: precision beats
    // type-consistency. 9007199254740993 is 2^53+1 and cannot survive a
    // double, so silently returning 9007199254740992 would be data loss.
    const [rec] = parser.bulkParse(
      [{ big: "9007199254740993", money: "1.10" }],
      fields([
        ["big", INT8],
        ["money", NUMERIC],
      ]),
    );
    // Real data loss: 2^53+1 would silently become ...992.
    expect(rec.toObject().big).toBe("9007199254740993");
    // NOT data loss: a trailing zero is display formatting, and refusing to
    // promote here is what leaves money columns sorting as text.
    expect(rec.toObject().money).toBe(1.1);
  });

  it("emits interval as text rather than a sparse object", () => {
    // postgres-interval only sets the components that are non-zero, so the
    // key set changed row to row: INTERVAL '1 day' gave {days:1} while
    // INTERVAL '2 hours' gave {hours:2}. A consumer reading .seconds got
    // undefined for most rows instead of 0.
    const interval = Object.create({
      toPostgres() {
        return "1 day";
      },
    });
    interval.days = 1;

    const [rec] = parser.bulkParse(
      [{ span: interval }],
      fields([["span", 1186]]),
    );
    expect(typeof rec.toObject().span).toBe("string");
    expect(rec.toObject().span).toBe("1 day");
  });

  it("still parses when no field descriptors are supplied", () => {
    // bulkParse(rows) without fields is used by callers that have no
    // descriptors; it must not throw, it simply cannot promote.
    const [rec] = parser.bulkParse([{ total: "42" }]);
    expect(rec.toObject().total).toBe("42");
  });
});
