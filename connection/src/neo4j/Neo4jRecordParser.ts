import { NeodashRecordParser } from "@neoboard/connector-sdk";
import {
  isInt,
  Record as Neo4jRecord,
  Relationship,
  Path,
  Node,
  DateTime,
  Date as Neo4jDate,
  Time,
  LocalTime,
  LocalDateTime,
  Duration,
  PathSegment,
  Point,
} from "neo4j-driver";
import { NeodashRecord } from "@neoboard/connector-sdk";

/**
 * Neo4jRecordParser
 *
 * Parses Neo4j records into plain JavaScript objects,
 * simplifying the handling of integers, nodes, relationships, etc.
 */
/**
 * How far ahead of UTC `zone` is at `instant`, in milliseconds.
 *
 * Formats the instant in the zone, then reads those wall-clock numbers back as
 * if they were UTC — the difference is the offset. This is the only way to ask
 * the platform about a zone; `Intl` exposes no offset directly.
 */
function zoneOffsetMs(zone: string, instant: number): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: zone,
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(instant);

  const at: Record<string, string> = {};
  for (const { type, value } of parts) at[type] = value;

  const wallClockAsUtc = Date.UTC(
    Number(at.year),
    Number(at.month) - 1,
    Number(at.day),
    // Some ICU builds render midnight as hour 24 under hour12:false.
    Number(at.hour) % 24,
    Number(at.minute),
    Number(at.second),
  );
  return wallClockAsUtc - instant;
}

/** `+02:00` / `-05:30` for an offset in seconds, rounded to the minute. */
function formatOffset(seconds: number): string {
  const sign = seconds < 0 ? "-" : "+";
  const abs = Math.abs(seconds);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${sign}${pad(Math.floor(abs / 3600))}:${pad(Math.floor((abs % 3600) / 60))}`;
}

/**
 * A DateTime with a named time zone, as an ISO string every JS date parser
 * accepts.
 *
 * The driver's own toString() appends the zone id in brackets —
 * `2024-06-01T14:30:05+02:00[Europe/Rome]` — and that suffix is not ISO 8601,
 * so `Date.parse` returns NaN. Every consumer of this value parses it as a
 * date: the gantt dropped every row and told the user their `datetime()`
 * column was "a year column such as released", and the line chart fell back to
 * a category axis without saying so (#1651).
 *
 * The offset preserves the instant exactly; the zone NAME does not survive.
 * That is the right trade for a value whose job is to be a timestamp — and it
 * is what a DateTime built with an offset has always produced.
 *
 * Two shapes reach here. Bolt 5.x sends the offset alongside the zone id, so
 * stripping the suffix is enough. Bolt 4.x and earlier send only the zone id,
 * leaving the offset null, so it has to be resolved for that wall clock — and
 * per instant, not per zone: Europe/Rome is +01:00 in January and +02:00 in
 * June.
 */
function zonedDateTimeToIso(value: DateTime): string {
  const withoutZone = value.toString().replace(/\[[^\]]+\]$/, "");
  // Bolt 5.x: the offset is already there and is exact.
  if (/(Z|[+-]\d{2}:\d{2}(:\d{2})?)$/.test(withoutZone)) return withoutZone;

  const zone = value.timeZoneId;
  if (zone == null) return withoutZone;

  try {
    // Sub-second digits do not affect the offset, and more than three of them
    // are outside what Date.parse promises to read.
    const wallClock = withoutZone.replace(/\.\d+$/, "");
    const asUtc = Date.parse(`${wallClock}Z`);
    if (Number.isNaN(asUtc)) return withoutZone;

    // Read the wall clock as UTC, then find the instant that shows that same
    // wall clock in the zone. A second pass settles the DST boundaries, where
    // the first guess lands on the wrong side of a transition.
    let instant = asUtc;
    for (let pass = 0; pass < 2; pass++) {
      instant = asUtc - zoneOffsetMs(zone, instant);
    }
    return withoutZone + formatOffset(zoneOffsetMs(zone, instant) / 1000);
  } catch {
    // An unknown zone id makes Intl throw. One odd value must not fail the
    // whole result set — fall back to the zone-less local time.
    return withoutZone;
  }
}

export class Neo4jRecordParser extends NeodashRecordParser {
  constructor() {
    // Constructor can be extended in the future if needed
    super();
  }
  /**
   * Parses a single Neo4j record into a JavaScript object.
   *
   * @param _record - A single Neo4j record to parse.
   * @returns A parsed JavaScript object representing the record.
   */
  _parse(
    _record:
      | Record<string, unknown>
      | NeodashRecord
      | Neo4jRecord<Record<string, unknown>>,
  ): NeodashRecord {
    // Parsing the record twice should return the same record
    if (_record instanceof NeodashRecord) {
      return _record;
    }
    // Everything that reaches this point comes from the driver and has the
    // Neo4j Record shape (keys + get) — the plain-object arm of the union
    // exists only for already-parsed pass-through inputs, which share it.
    const record = _record as Neo4jRecord<Record<string, unknown>>;
    const parsed: Record<string, unknown> = {};

    for (const key of record.keys) {
      const value = record.get(key);
      parsed[key as string] = this.__neo4jToNative(value);
    }
    return new NeodashRecord(parsed);
  }

  /**
   * Converts Neo4j data types to native JavaScript types
   * @param {unknown} value - Value from Neo4j result
   * @return {unknown} - Value converted to JavaScript native type
   */
  private __neo4jToNative(value: unknown): unknown {
    // Main dispatcher function
    if (value === null || value === undefined) {
      return value;
    }

    // Process based on type
    if (this.isPrimitive(value)) {
      return this.parsePrimitive(value);
    } else if (this.isTemporal(value)) {
      return this.parseTemporal(value);
    } else if (this.isGraphObject(value)) {
      return this.parseGraphObject(value);
    } else if (Array.isArray(value)) {
      return value.map((item) => this.__neo4jToNative(item));
    } else if (typeof value === "object") {
      return this.neo4jConvertPlainObject(value);
    }

    // Default: return as is
    return value;
  }

  /**
   * Determines if the provided value is a primitive type relevant to Neo4j parsing.
   * This includes:
   * - Neo4j Integer (`isInt`)
   * - JavaScript primitive types: `boolean`, `string`, `number`
   *
   * @param {any} value - The value to check.
   * @returns {boolean} True if the value is a Neo4j Integer or a JS primitive type used in Neo4j responses.
   */
  isPrimitive(value: unknown): boolean {
    return (
      isInt(value) ||
      typeof value === "boolean" ||
      typeof value === "string" ||
      typeof value === "number"
    );
  }

  /**
   * Converts a Neo4j primitive type to a native JavaScript type.
   * For Neo4j Integer values, converts to number if in safe range,
   * otherwise returns as string to avoid precision loss.
   *
   * @param {any} value - The Neo4j primitive value to convert.
   * @returns {number|string|boolean} The JavaScript representation of the value.
   */

  parsePrimitive(value: unknown): number | string | boolean {
    if (isInt(value)) {
      // String, not BigInt, beyond the safe range. JSON.stringify throws on a
      // BigInt, so the old branch failed the entire query with an opaque 500
      // the moment such a value reached the API boundary — RETURN id(n) on a
      // large graph was enough. A string is JSON-safe, lossless, and matches
      // what the PostgreSQL connector already emits for int8, so a widget no
      // longer has to know which database a column came from (#1304).
      //
      // NOT fixed by disableLosslessIntegers on the driver: that returns plain
      // numbers for EVERY integer, silently rounding exactly the values this
      // is about. The parser must keep receiving Integer objects so
      // inSafeRange() can decide per value.
      return value.inSafeRange() ? value.toNumber() : value.toString();
    }

    if (
      typeof value === "boolean" ||
      typeof value === "string" ||
      typeof value === "number"
    ) {
      return value;
    }

    throw new Error(
      `Unexpected value passed to parsePrimitive: ${typeof value}`,
    );
  }

  /**
   * Determines if the provided value is a Neo4j temporal type.
   * Includes types like Date, DateTime, LocalTime, Time, Duration, etc.
   *
   * @param {any} value - The value to check.
   * @returns {boolean} True if the value is a known Neo4j temporal type.
   */
  isTemporal(
    value: unknown,
  ): value is
    Neo4jDate | Time | LocalTime | DateTime | LocalDateTime | Duration {
    return (
      value instanceof Neo4jDate ||
      value instanceof Time ||
      value instanceof LocalTime ||
      value instanceof DateTime ||
      value instanceof LocalDateTime ||
      value instanceof Duration
    );
  }

  /**
   * Converts Neo4j temporal types into JavaScript-native representations.
   * - Neo4jDate: "YYYY-MM-DD" string
   * - Time: "HH:mm:ss.nnnnnnnnn+HH:MM" string
   * - Duration: plain JS object with numeric fields
   * - everything else: the driver's own lossless ISO-8601 toString()
   *
   * Strings, not Dates. A JS Date is an absolute instant, which a LocalDateTime
   * deliberately is not — and an ISO string is what a browser can parse
   * unambiguously (#1306).
   *
   * @param {object} value - A temporal value from Neo4j, possibly with fields like year, month, hour, etc.
   * @returns {Date|string|object} A native JS object or string, depending on the type.
   */
  parseTemporal(
    value: Neo4jDate | Time | LocalTime | DateTime | LocalDateTime | Duration,
  ): unknown {
    if (value instanceof Neo4jDate) {
      const y = value.year.toNumber();
      const m = String(value.month.toNumber()).padStart(2, "0");
      const d = String(value.day.toNumber()).padStart(2, "0");
      return `${y}-${m}-${d}`;
    }

    if (value instanceof Time) {
      const offsetSeconds = value.timeZoneOffsetSeconds.toNumber();
      const offsetHours = Math.floor(Math.abs(offsetSeconds) / 3600);
      const offsetMinutes = Math.floor((Math.abs(offsetSeconds) % 3600) / 60);
      const sign = offsetSeconds >= 0 ? "+" : "-";

      // Accepts neo4j Integer too — String() routes through its toString().
      const pad = (num: number | string | { toString(): string }) =>
        String(num).padStart(2, "0");

      return `${pad(value.hour)}:${pad(value.minute)}:${pad(value.second)}.${value.nanosecond
        .toString()
        .padStart(9, "0")}${sign}${pad(offsetHours)}:${pad(offsetMinutes)}`;
    }

    // Every remaining temporal type formats itself losslessly and in ISO-8601
    // via the driver's own toString(): DateTime keeps its offset and all nine
    // nanosecond digits, LocalTime pads to HH:mm:ss.nnnnnnnnn, and
    // LocalDateTime stays zone-LESS.
    //
    // This replaced three hand-rolled formatters, two of which were lossy and
    // one of which turned a zone-less value into an absolute instant in the
    // server process's timezone — so the same row rendered differently
    // depending on where the server ran. All three failed silently, showing a
    // plausible-looking wrong value (#1306).
    //
    // Duration is the one exception below: it has no useful ISO round-trip for
    // charts, and consumers already read the object form.
    if (value instanceof Duration) {
      return {
        months: value.months.toNumber(),
        days: value.days.toNumber(),
        seconds: value.seconds.toNumber(),
        nanoseconds: value.nanoseconds.toNumber(),
      };
    }

    // A DateTime carrying a named zone is the one shape the driver's toString()
    // renders unparseably (#1651) — see zonedDateTimeToIso.
    if (value instanceof DateTime && value.timeZoneId != null) {
      return zonedDateTimeToIso(value);
    }

    return value.toString();
  }

  /**
   * Determines if the provided value is a Neo4j complex object type,
   * such as Node, Relationship, Path, Point, etc.
   *
   * @param {any} value - The value to check.
   * @returns {boolean} True if the value is a known Neo4j object type.
   */
  isGraphObject(value: unknown) {
    return (
      value instanceof Node ||
      value instanceof Relationship ||
      value instanceof Path ||
      value instanceof PathSegment ||
      value instanceof Point
    );
  }

  /**
   * Converts Neo4j complex object types into plain JavaScript objects.
   * Handles Node, Relationship, Path, PathSegment, and Point structures.
   * Recursively parses identity and properties using neo4jToNative.
   *
   * @param {any} value - The Neo4j object to convert.
   * @returns {object} A plain JavaScript object representing the structure.
   */
  parseGraphObject(value: unknown) {
    if (value instanceof Node) {
      return {
        identity: this.__neo4jToNative(value.identity),
        elementId: value.elementId,
        labels: value.labels,
        properties: this.neo4jConvertPlainObject(value.properties as object),
      };
    }

    if (value instanceof Relationship) {
      return {
        identity: this.__neo4jToNative(value.identity),
        elementId: value.elementId,
        start: this.__neo4jToNative(value.start),
        startNodeElementId: value.startNodeElementId,
        end: this.__neo4jToNative(value.end),
        endNodeElementId: value.endNodeElementId,
        type: value.type,
        properties: this.neo4jConvertPlainObject(value.properties as object),
      };
    }

    // Rebuilt rather than returned as-is (#1305). A driver Path holds live
    // Node/Relationship instances whose Integer properties survive JSON
    // serialisation as {low, high}, so returning it here leaked raw driver
    // types past the connection boundary that app/ is contracted to be able to
    // trust. Recursing through __neo4jToNative reuses the Node and
    // Relationship arms above rather than duplicating their conversion.
    //
    // The key names are load-bearing: transformToGraphData, validateGraphData,
    // extractNodeAndRelPropertiesFromRecords and NeodashRecord.getFields all
    // key off start/end/segments/relationship.
    if (value instanceof Path) {
      return {
        start: this.__neo4jToNative(value.start),
        end: this.__neo4jToNative(value.end),
        segments: value.segments.map((segment) =>
          this.__neo4jToNative(segment),
        ),
        // Already a plain number in the driver — not an Integer like identity.
        length: value.length,
      };
    }

    if (value instanceof PathSegment) {
      return {
        start: this.__neo4jToNative(value.start),
        relationship: this.__neo4jToNative(value.relationship),
        end: this.__neo4jToNative(value.end),
      };
    }

    if (value instanceof Point) {
      const point: { srid: unknown; x: unknown; y: unknown; z?: unknown } = {
        srid: this.__neo4jToNative(value.srid),
        x: this.__neo4jToNative(value.x),
        y: this.__neo4jToNative(value.y),
      };

      if (value.z !== undefined) {
        point.z = this.__neo4jToNative(value.z);
      }

      return point;
    }

    return value;
  }

  /**
   * Recursively converts all properties of a plain JavaScript object
   * that may contain nested Neo4j values (e.g., Integers, temporal, nodes).
   *
   * @param {object} value - The object to recursively process.
   * @returns {object} A fully converted JavaScript object.
   */
  neo4jConvertPlainObject(value: object): object {
    return super.convertPlainObject(value, (v) => this.__neo4jToNative(v));
  }
}
