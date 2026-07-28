import { NeodashRecordParser } from "@neoboard/connector-sdk";
import { NeodashRecord } from "@neoboard/connector-sdk";

/**
 * PostgreSQL Record Parser
 * Converts PostgreSQL result sets to NeodashRecord format.
 */
/** pg type OIDs that arrive as TEXT because pg-types registers no parser. */
const OID_INT8 = 20;
const OID_NUMERIC = 1700;

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
  ): NeodashRecord[] {
    const numericColumns = new Set(
      (fields ?? [])
        .filter(
          (f) => f.dataTypeID === OID_INT8 || f.dataTypeID === OID_NUMERIC,
        )
        .map((f) => f.name),
    );
    return records.map((r) => this._parse(r, numericColumns));
  }

  /**
   * Parses a single PostgreSQL row into a NeodashRecord.
   * @param _record - A single row from PostgreSQL query results
   * @param _numericColumns - column names whose text should become numbers
   * @returns A NeodashRecord instance
   */
  _parse(
    _record: Record<string, unknown>,
    _numericColumns?: ReadonlySet<string>,
  ): NeodashRecord {
    // If already a NeodashRecord, return as is
    if (_record instanceof NeodashRecord) {
      return _record;
    }

    const parsed: Record<string, unknown> = {};

    for (const key in _record) {
      if (Object.hasOwn(_record, key)) {
        const raw = _record[key];
        parsed[key] =
          _numericColumns?.has(key) && typeof raw === "string"
            ? promoteNumericText(raw)
            : this._pgToNative(raw);
      }
    }

    return new NeodashRecord(parsed);
  }

  /**
   * Converts PostgreSQL data types to native JavaScript types.
   * The pg driver already returns native JS types for primitives and temporals;
   * this handles nulls, arrays, temporals (preserved as Date), and plain objects.
   * @param value - Value from PostgreSQL result
   * @returns Value converted to JavaScript native type
   */
  private _pgToNative(value: unknown): unknown {
    if (value == null) return value;
    if (Array.isArray(value))
      return value.map((item) => this._pgToNative(item));
    // Temporals (timestamp/timestamptz/date) arrive as native Date instances.
    // A Date is `typeof === 'object'`, so it must be handled BEFORE the
    // plain-object branch — otherwise pgConvertPlainObject copies its (zero)
    // enumerable own properties and flattens it to {}. (#1054)
    if (this.isTemporal(value)) return this.parseTemporal(value);
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
    // a consumer reading .seconds got undefined rather than 0, and the
    // prototype's toPostgres()/toISOString() were dropped. Emit Postgres's own
    // canonical text instead, mirroring the bytea branch above (#1307).
    if (isPostgresInterval(value)) {
      return value.toPostgres();
    }
    if (typeof value === "object")
      return this.pgConvertPlainObject(value as object);
    return value;
  }

  /**
   * No-op: pg driver already returns native primitives.
   */
  isPrimitive(value: unknown): boolean {
    const type = typeof value;
    return (
      type === "boolean" ||
      type === "string" ||
      type === "number" ||
      type === "bigint"
    );
  }

  /**
   * No-op: pg driver already returns native primitives.
   */
  parsePrimitive(value: unknown): unknown {
    return value;
  }

  /**
   * No-op: pg driver already returns native Date instances.
   */
  isTemporal(value: unknown): boolean {
    return value instanceof Date;
  }

  /**
   * No-op: pg driver already returns native Date instances.
   */
  parseTemporal(value: unknown): unknown {
    return value;
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

/** postgres-interval instances expose toPostgres() on their prototype. */
function isPostgresInterval(
  value: unknown,
): value is { toPostgres: () => string } {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as { toPostgres?: unknown }).toPostgres === "function"
  );
}
