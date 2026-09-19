import { PostgresRecordParser } from "../../src/postgresql/PostgresRecordParser";

describe("PostgreSQL Record Parser", () => {
  let parser: PostgresRecordParser;

  beforeEach(() => {
    parser = new PostgresRecordParser();
  });

  test("should implement _parse to return a plain row object", () => {
    const row = { id: 1, name: "Alice", age: 30 };

    const result = parser["_parse"](row);

    // A plain object, not the Proxy it used to be (#1904): with no ownKeys
    // trap, Object.keys(row) answered ["record"].
    expect(Object.getPrototypeOf(result)).toBe(Object.prototype);
    expect(Object.keys(result)).toEqual(["id", "name", "age"]);
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

  test("should implement bulkParse to return an array of plain rows", () => {
    const rows = [
      { id: 1, name: "Alice" },
      { id: 2, name: "Bob" },
    ];

    const results = parser.bulkParse(rows);

    expect(results).toEqual([
      { id: 1, name: "Alice" },
      { id: 2, name: "Bob" },
    ]);
    // New objects, not the driver's own rows handed back.
    expect(results[0]).not.toBe(rows[0]);
  });

  // The four no-op methods this block used to test — isPrimitive,
  // parsePrimitive, isTemporal, parseTemporal — were deleted in #1904 together
  // with the abstract declarations that forced them into existence, and so
  // were the base class's isGraphObject / parseGraphObject defaults that
  // nothing called. One of those tests pinned parsePrimitive(BigInt(999)) ===
  // BigInt(999): a BigInt passed straight through, on which JSON.stringify
  // throws. What replaced it is the BigInt fixture in
  // __tests__/conformance/pg-shapes.test.ts.

  test("should handle nested objects in _parse", () => {
    const row = {
      id: 1,
      metadata: { created: new Date(), tags: ["a", "b"] },
      scores: [10, 20, 30],
    };

    const result = parser["_parse"](row);

    expect(result.id).toBe(1);
    expect(result.metadata).toBeDefined();
    expect(Array.isArray(result.scores)).toBe(true);
  });

  test("should handle null and undefined values", () => {
    const row = { id: 1, name: null, age: undefined };

    const result = parser["_parse"](row);

    expect(result.id).toBe(1);
    expect(result.name).toBeNull();
    // A missing value is null, never undefined (#1904): JSON drops an
    // undefined key, so the column would vanish from the row. node-pg itself
    // only ever yields null, so this changes nothing a user sees.
    expect(result.age).toBeNull();
  });

  // Regression: a top-level Date column must survive _parse as a usable
  // temporal value, not be flattened to {} by the plain-object branch of
  // _pgToNative (#1054). Since #1904 the parser emits the ISO string itself
  // rather than leaving a live Date for JSON.stringify to find — the wire form
  // asserted below is unchanged, it is just produced one step earlier.
  test("should emit a top-level Date column as an ISO string, not flatten it to {}", () => {
    const ts = new Date("2025-12-07T00:07:58.104Z");
    const row = { id: 1, created_at: ts };

    const result = parser["_parse"](row);

    expect(result.created_at).toBe("2025-12-07T00:07:58.104Z");
    // The real-world symptom: JSON serialization (API boundary) must not be {}.
    expect(JSON.stringify(result.created_at)).toBe(
      '"2025-12-07T00:07:58.104Z"',
    );
  });

  test("should emit Date instances inside arrays as ISO strings", () => {
    const ts = new Date("2025-12-07T00:07:58.104Z");
    const row = { id: 1, timestamps: [ts] };

    const result = parser["_parse"](row);

    expect(result.timestamps).toEqual(["2025-12-07T00:07:58.104Z"]);
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
    expect(rec.total).toBe(42);
    expect(rec.amount).toBe(-12.5);
  });

  it("leaves a text column alone even when it looks numeric", () => {
    // This is why promotion is gated on the column's OID rather than on the
    // string's shape: a product code of "42" must stay a string.
    const [rec] = parser.bulkParse([{ sku: "42" }], fields([["sku", TEXT]]));
    expect(rec.sku).toBe("42");
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
    expect(rec.big).toBe("9007199254740993");
    // NOT data loss: a trailing zero is display formatting, and refusing to
    // promote here is what leaves money columns sorting as text.
    expect(rec.money).toBe(1.1);
  });

  it("emits interval as an ISO-8601 duration rather than a sparse object", () => {
    // postgres-interval only sets the components that are non-zero, so the
    // key set changed row to row: INTERVAL '1 day' gave {days:1} while
    // INTERVAL '2 hours' gave {hours:2}. A consumer reading .seconds got
    // undefined for most rows instead of 0 (#1307).
    //
    // #1307 settled on the database's own text ("1 day"). #1904 changed that
    // pin on purpose: every connector emits one ISO-8601 duration form, so a
    // duration reads the same whichever database it came from. The wire-text
    // examples, negative and mixed-sign included, are in
    // __tests__/conformance/pg-shapes.test.ts.
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
    expect(rec.span).toBe("P1D");
  });

  it("still parses when no field descriptors are supplied", () => {
    // bulkParse(rows) without fields is used by callers that have no
    // descriptors; it must not throw, it simply cannot promote.
    const [rec] = parser.bulkParse([{ total: "42" }]);
    expect(rec.total).toBe("42");
  });
});

describe("PostgresRecordParser — DATE is a calendar day, not an instant (#1654)", () => {
  const parser = new PostgresRecordParser();
  const DATE = 1082;
  const DATE_ARRAY = 1182;
  const TIMESTAMPTZ = 1184;

  const fields = (defs: Array<[string, number]>) =>
    defs.map(([name, dataTypeID]) => ({ name, dataTypeID }));

  it("returns YYYY-MM-DD, not a UTC instant", () => {
    // node-pg parses a DATE into a JS Date at the SERVER PROCESS's local
    // midnight, and that JSON-serialises to the previous day for any server
    // east of UTC — a stored 2024-06-01 reaching the browser as
    // "2024-05-31T22:00:00.000Z". Neo4j emits "2024-06-01" for the identical
    // concept, so the two connectors disagreed about what a date is.
    //
    // The date-only string is what pg puts on the wire in the first place;
    // this just stops it being turned into an instant it never was.
    const [rec] = parser.bulkParse(
      [{ d: new Date(2024, 5, 1) }], // local midnight, as pg's parser builds it
      fields([["d", DATE]]),
    );
    expect(rec.d).toBe("2024-06-01");
  });

  it("is not sensitive to the runtime timezone", () => {
    // The whole defect was invisible under TZ=UTC, which is why CI never saw
    // it. Reading the LOCAL components of a Date the local parser built round-
    // trips exactly, in any zone.
    const [rec] = parser.bulkParse(
      [{ d: new Date(2024, 0, 1) }],
      fields([["d", DATE]]),
    );
    expect(rec.d).toBe("2024-01-01");
  });

  it("pads single-digit months and days", () => {
    const [rec] = parser.bulkParse(
      [{ d: new Date(2024, 0, 9) }],
      fields([["d", DATE]]),
    );
    expect(rec.d).toBe("2024-01-09");
  });

  it("leaves TIMESTAMPTZ as an instant", () => {
    // A timestamptz genuinely IS a point in time; only DATE is a calendar day
    // with no time and no zone. #1654's decision stands — it still carries the
    // instant. Since #1904 the parser spells it as the ISO string JSON always
    // turned it into, instead of handing on a live Date.
    const instant = new Date("2024-06-01T14:30:05.000Z");
    const [rec] = parser.bulkParse(
      [{ t: instant }],
      fields([["t", TIMESTAMPTZ]]),
    );
    expect(rec.t).toBe("2024-06-01T14:30:05.000Z");
  });

  it("handles a DATE array", () => {
    const [rec] = parser.bulkParse(
      [{ ds: [new Date(2024, 5, 1), new Date(2024, 5, 2)] }],
      fields([["ds", DATE_ARRAY]]),
    );
    expect(rec.ds).toEqual(["2024-06-01", "2024-06-02"]);
  });

  it("passes a null date through", () => {
    const [rec] = parser.bulkParse([{ d: null }], fields([["d", DATE]]));
    expect(rec.d).toBeNull();
  });

  it("leaves an infinite date alone rather than inventing a day", () => {
    // pg renders 'infinity'::date as Infinity, not a Date.
    const [rec] = parser.bulkParse([{ d: Infinity }], fields([["d", DATE]]));
    expect(rec.d).toBe(Infinity);
  });
});
