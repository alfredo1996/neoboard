import { NeodashRecordParser } from '../generalized/NeodashRecordParser';
import { NeodashRecord } from '../generalized/NeodashRecord';

/**
 * PostgreSQL Record Parser
 * Converts PostgreSQL result sets to NeodashRecord format.
 */
export class PostgresRecordParser extends NeodashRecordParser {
  /**
   * Parses a single PostgreSQL row into a NeodashRecord.
   * @param _record - A single row from PostgreSQL query results
   * @returns A NeodashRecord instance
   */
  _parse(_record: Record<string, unknown>): NeodashRecord {
    // If already a NeodashRecord, return as is
    if (_record instanceof NeodashRecord) {
      return _record;
    }

    const parsed: Record<string, unknown> = {};

    for (const key in _record) {
      if (Object.hasOwn(_record, key)) {
        parsed[key] = this._pgToNative(_record[key]);
      }
    }

    return new NeodashRecord(parsed);
  }

  /**
   * Converts PostgreSQL data types to native JavaScript types.
   * The pg driver already returns native JS types for primitives and temporals,
   * so this only needs to handle nulls, arrays, and plain objects.
   * @param value - Value from PostgreSQL result
   * @returns Value converted to JavaScript native type
   */
  private _pgToNative(value: unknown): unknown {
    if (value == null) return value;
    if (Array.isArray(value)) return value.map((item) => this._pgToNative(item));
    if (typeof value === 'object') return this.pgConvertPlainObject(value as object);
    return value;
  }

  /**
   * No-op: pg driver already returns native primitives.
   */
  isPrimitive(value: unknown): boolean {
    const type = typeof value;
    return type === 'boolean' || type === 'string' || type === 'number' || type === 'bigint';
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
