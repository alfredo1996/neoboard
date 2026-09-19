import {
  integerToRowValue,
  NeodashRecordParser,
  toIsoDuration,
} from "@neoboard/connector-sdk";

/**
 * PostgreSQL Record Parser
 * Converts PostgreSQL result sets to plain rows of the SDK's row value contract.
 */
/** pg type OIDs that arrive as TEXT because pg-types registers no parser. */
const OID_INT8 = 20;
const OID_NUMERIC = 1700;

/** DATE and DATE[] — a calendar day, with no time and no zone. */
const OID_DATE = 1082;
const OID_DATE_ARRAY = 1182;

/** TIMESTAMP (without time zone) and its array — a wall clock, not an instant. */
const OID_TIMESTAMP = 1114;
const OID_TIMESTAMP_ARRAY = 1115;

/** TIMETZ and its array — the server writes a whole-hour offset as `+02`. */
const OID_TIMETZ = 1266;
const OID_TIMETZ_ARRAY = 1270;

type Converter = (value: unknown) => unknown;

/** Apply `convert` to a value, or to every element of an array column. */
const each =
  (convert: Converter): Converter =>
  (value) =>
    Array.isArray(value) ? value.map(each(convert)) : convert(value);

/**
 * `YYYY-MM-DD` from a Date's LOCAL components.
 *
 * node-pg parses a DATE with `new Date(y, m - 1, d)` — the server process's
 * local midnight — so reading the local components back recovers the stored
 * day exactly, in any zone. Serialising the Date instead yields a UTC instant,
 * which is the PREVIOUS DAY for any server east of UTC: a stored 2024-06-01
 * reached the browser as "2024-05-31T22:00:00.000Z", and 2024-01-01 as the
 * previous year (#1654).
 *
 * This is also what pg puts on the wire in the first place, and what
 * Neo4jRecordParser emits for the identical concept — so the two connectors
 * now agree about what a date is. A TIMESTAMP is left alone: that genuinely is
 * an instant.
 *
 * The year is padded to four digits because the consumers match on
 * /^\d{4}-\d{2}-\d{2}$/ (app/src/plugins/gantt/transform.ts).
 */
function toCalendarDay(value: unknown): unknown {
  // 'infinity'::date arrives as Infinity, not a Date — leave it be rather
  // than inventing a day for it.
  if (!(value instanceof Date) || Number.isNaN(value.getTime())) return value;
  const pad = (n: number, width = 2) => String(n).padStart(width, "0");
  return `${pad(value.getFullYear(), 4)}-${pad(value.getMonth() + 1)}-${pad(value.getDate())}`;
}

/**
 * A TIMESTAMP WITHOUT TIME ZONE as a zone-less ISO string:
 * `2024-03-15T10:30:00.000` — no `Z`, no offset.
 *
 * node-pg builds it with `new Date(y, m, d, h, mi, s, ms)` — the server
 * process's LOCAL clock — so the Date is an instant the database never stored.
 * Serialising it (what JSON.stringify did) moved the value by the server's
 * offset: 10:30 stored, 08:30Z shown on a UTC+2 server, a different answer on
 * every host. That is #1306(c) exactly, fixed there for the graph side's
 * identical concept: the wall clock has to stay zone-less all the way to the
 * widget, which only a string can do. Reading the local components back
 * recovers what was stored, the way toCalendarDay does for #1654.
 *
 * Shifting by the instant's own offset and dropping the `Z` lets the stdlib do
 * the padding, including years outside 0000–9999.
 *
 * ponytail: a wall clock inside the server zone's DST gap (02:30 on a
 * spring-forward night) never existed there, so node-pg has already moved it
 * an hour before this runs. Exact only with a raw-text type parser for OID
 * 1114 on the cursor — add it if a user stores such values and the server
 * cannot run in UTC.
 */
function toLocalDateTime(value: unknown): unknown {
  // 'infinity'::timestamp arrives as a number — leave it be.
  if (!(value instanceof Date)) return value;
  if (Number.isNaN(value.getTime())) return null;
  const shifted = value.getTime() - value.getTimezoneOffset() * 60_000;
  return new Date(shifted).toISOString().slice(0, -1);
}

/**
 * `10:30:00+02` → `10:30:00+02:00`. The server omits the offset's minutes when
 * they are zero and appends seconds for a pre-standard zone; every connector
 * emits `±HH:MM`.
 */
function toOffsetTime(value: unknown): unknown {
  if (typeof value !== "string") return value;
  // Only the offset at the tail is matched; the clock is whatever precedes it.
  const match = /([+-]\d{2})(?::(\d{2}))?(?::\d{2})?$/.exec(value);
  if (!match) return value;
  const [, hours, minutes = "00"] = match;
  return `${value.slice(0, match.index)}${hours}:${minutes}`;
}

const numericText: Converter = (value) =>
  typeof value === "string" ? promoteNumericText(value) : value;

/**
 * What a column type needs BEFORE the generic conversion. A converter that
 * does not recognise its value hands it back unchanged, and the generic pass
 * still runs on the result — so a BigInt in an int8 column, or a Date nobody
 * expected, is caught there rather than slipping through a typed column.
 */
const COLUMN_CONVERTERS: Record<number, Converter> = {
  [OID_INT8]: numericText,
  [OID_NUMERIC]: numericText,
  [OID_DATE]: toCalendarDay,
  [OID_DATE_ARRAY]: each(toCalendarDay),
  [OID_TIMESTAMP]: toLocalDateTime,
  [OID_TIMESTAMP_ARRAY]: each(toLocalDateTime),
  [OID_TIMETZ]: toOffsetTime,
  [OID_TIMETZ_ARRAY]: each(toOffsetTime),
};

export class PostgresRecordParser extends NeodashRecordParser {
  /**
   * Parses rows, optionally promoting int8/numeric columns to numbers (#1307).
   *
   * `fields` is passed per call rather than stored on the instance: the parser
   * is constructed once and shared across every concurrent query the scheduler
   * dispatches on a connection, so per-query state here would corrupt across
   * queries.
   */
  bulkParse(
    records: Record<string, unknown>[],
    fields?: ReadonlyArray<{ name: string; dataTypeID: number }>,
  ): Record<string, unknown>[] {
    // Resolved once per query, not per row: the rows are then canonicalised in
    // the one pass below, with a single map lookup per cell (#1904).
    const converters = new Map<string, Converter>();
    for (const field of fields ?? []) {
      const convert = COLUMN_CONVERTERS[field.dataTypeID];
      if (convert) converters.set(field.name, convert);
    }
    return records.map((r) => this._parse(r, converters));
  }

  /**
   * Parses a single PostgreSQL row into a plain row object.
   * @param _record - A single row from PostgreSQL query results
   * @param _converters - per-column conversions, keyed by column name
   * @returns The row, column name → row value
   */
  _parse(
    _record: Record<string, unknown>,
    _converters?: ReadonlyMap<string, Converter>,
  ): Record<string, unknown> {
    const parsed: Record<string, unknown> = {};

    for (const key in _record) {
      if (Object.hasOwn(_record, key)) {
        const convert = _converters?.get(key);
        const raw = _record[key];
        parsed[key] = this._pgToNative(convert ? convert(raw) : raw);
      }
    }

    return parsed;
  }

  /**
   * Converts PostgreSQL data types to native JavaScript types.
   * The pg driver already returns native JS types for primitives and temporals;
   * this handles nulls, arrays, temporals (preserved as Date), and plain objects.
   * @param value - Value from PostgreSQL result
   * @returns Value converted to JavaScript native type
   */
  private _pgToNative(value: unknown): unknown {
    // A missing value is null, never undefined: JSON drops an undefined key,
    // so the column would vanish from the row.
    if (value == null) return null;
    // Most cells are strings, numbers and booleans, and none of the object
    // checks below can match one — so settle them here. Every cell passes
    // through this function since #1904; without the early exit a 100 000-row
    // result paid for six pointless checks per cell.
    if (typeof value !== "object") {
      // Only a custom type parser yields a BigInt, and JSON.stringify throws
      // on one. Same number-or-decimal-string rule as int8 text (#1904).
      return typeof value === "bigint" ? integerToRowValue(value) : value;
    }
    if (Array.isArray(value))
      return value.map((item) => this._pgToNative(item));
    // A Date that reaches here is an INSTANT — a timestamptz, or a Date with no
    // column type to say otherwise (a timestamp WITHOUT zone was already made a
    // zone-less string by its column converter). Emitted as an ISO string by
    // the parser instead of left live for JSON.stringify to find (#1904).
    // Before the plain-object branch, which would flatten it to {} (#1054).
    // toISOString() throws on an invalid Date; JSON made that null already.
    if (value instanceof Date) {
      return Number.isNaN(value.getTime()) ? null : value.toISOString();
    }
    // bytea arrives as a Buffer. A Buffer is `typeof === 'object'` and not a
    // Date, so without this it falls into pgConvertPlainObject, which
    // enumerates its numeric indices and returns {"0":12,"1":255,…} — the
    // binary value is destroyed and a multi-MB blob explodes into a
    // million-key object. Emit Postgres's canonical `\x…` hex text instead. (#MEDIUM)
    if (Buffer.isBuffer(value)) {
      return "\\x".concat(value.toString("hex"));
    }
    // interval arrives as a prototype-bearing PostgresInterval whose own
    // enumerable keys are only the NON-ZERO components, so the generic object
    // copier below produced {days:1} for one row and {hours:2} for the next —
    // a consumer reading .seconds got undefined rather than 0 (#1307). It then
    // became Postgres's own text ("1 mon 2 days"), which only this database
    // writes. Now the SDK's one ISO-8601 duration, as every connector emits
    // (#1904).
    if (isPostgresInterval(value)) return intervalToIsoDuration(value);
    // Everything that is not an object returned at the top.
    return this.pgConvertPlainObject(value);
  }

  /**
   * Recursively converts all properties of a plain JavaScript object.
   * @param value - The object to recursively process
   * @returns A fully converted JavaScript object
   */
  private pgConvertPlainObject(value: object): Record<string, unknown> {
    return super.convertPlainObject(value, (v) => this._pgToNative(v));
  }
}

/**
 * Promote int8/numeric text to a number when the VALUE survives a double.
 *
 * Mirrors the contract the Neo4j side applies via inSafeRange(): precision
 * beats type-consistency. "9007199254740993" is 2^53+1 and would silently
 * become ...992, so it stays a string — that is real data loss.
 *
 * A literal `String(n) === value` check is too strict, and would have left the
 * single most common case broken: numeric(10,2) money arrives as "-12.50",
 * whose round-trip is "-12.5". A trailing zero is FORMATTING, not value —
 * display precision belongs to formatNumber, and refusing to promote here is
 * exactly what makes a table sort "100" before "9" and a CSV export land as
 * text in Excel. So the comparison normalises insignificant zeros away and
 * still rejects anything that changes magnitude or significant digits.
 */
function promoteNumericText(value: string): string | number {
  const n = Number(value);
  if (!Number.isFinite(n)) return value;
  return canonicalNumeric(value) === canonicalNumeric(String(n)) ? n : value;
}

/** Strip formatting-only differences: leading +, trailing fraction zeros. */
function canonicalNumeric(text: string): string {
  const trimmed = text.trim().replace(/^\+/, "");
  if (!trimmed.includes(".")) return trimmed;
  return trimmed.replace(/0+$/, "").replace(/\.$/, "");
}

/** Only the NON-ZERO components are set, each signed on its own. */
interface PostgresInterval {
  toPostgres: () => string;
  years?: number;
  months?: number;
  days?: number;
  hours?: number;
  minutes?: number;
  seconds?: number;
  milliseconds?: number;
}

/**
 * The interval's components into the SDK's four quantities. Not the object's
 * own toISOString(): that prints every zero component (`P0Y0M4DT1H2M3S`) and
 * would be a second rule beside the one every connector shares.
 */
function intervalToIsoDuration(interval: PostgresInterval): string {
  const {
    years = 0,
    months = 0,
    days = 0,
    hours = 0,
    minutes = 0,
    seconds = 0,
    milliseconds = 0,
  } = interval;
  return toIsoDuration({
    months: years * 12 + months,
    days,
    seconds: hours * 3600 + minutes * 60 + seconds,
    // `milliseconds` holds the microsecond fraction as a float (0.001 = 1 µs),
    // so this is an integer again once rounded.
    nanoseconds: Math.round(milliseconds * 1_000_000),
  });
}

/** postgres-interval instances expose toPostgres() on their prototype. */
function isPostgresInterval(value: unknown): value is PostgresInterval {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as { toPostgres?: unknown }).toPostgres === "function"
  );
}
