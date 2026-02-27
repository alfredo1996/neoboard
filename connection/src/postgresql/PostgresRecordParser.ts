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

    const parsed: Record<string, any> = {};

    for (const key in _record) {
      if (Object.hasOwnProperty.call(_record, key)) {
        parsed[key] = this._pgToNative(_record[key]);
      }
    }

    return new NeodashRecord(parsed);
  }

  /**
   * Converts PostgreSQL data types to native JavaScript types.
   * @param value - Value from PostgreSQL result
   * @returns Value converted to JavaScript native type
   */
  private _pgToNative(value: any): any {
    if (value === null || value === undefined) {
      return value;
    }

    // Process based on type
    if (this.isPrimitive(value)) {
      return this.parsePrimitive(value);
    } else if (this.isTemporal(value)) {
      return this.parseTemporal(value);
    } else if (Array.isArray(value)) {
      return value.map((item) => this._pgToNative(item));
    } else if (typeof value === 'object') {
      return this.convertPlainObject(value);
    }

    // Default: return as is
    return value;
  }

  /**
   * Determines if the provided value is a primitive type.
   * @param value - The value to check
   * @returns True if the value is a primitive type
   */
  isPrimitive(value: unknown): boolean {
    const type = typeof value;
    return type === 'boolean' || type === 'string' || type === 'number' || type === 'bigint';
  }

  /**
   * Converts a primitive type to native JavaScript.
   * @param value - The primitive value to convert
   * @returns The JavaScript representation of the value
   */
  parsePrimitive(value: unknown): number | string | boolean | bigint {
    // PostgreSQL driver already converts most primitives correctly
    return value;
  }

  /**
   * Determines if the provided value is a temporal type (Date).
   * @param value - The value to check
   * @returns True if the value is a Date
   */
  isTemporal(value: unknown): boolean {
    return value instanceof Date;
  }

  /**
   * Converts temporal types to JavaScript Date or string representation.
   * @param value - A temporal value from PostgreSQL
   * @returns A native JS Date or ISO string
   */
  parseTemporal(value: unknown): Date | string {
    if (value instanceof Date) {
      return value;
    }
    return value;
  }

  /**
   * Recursively converts all properties of a plain JavaScript object.
   * @param value - The object to recursively process
   * @returns A fully converted JavaScript object
   */
  private convertPlainObject(value: object): object {
    const result: Record<string, any> = {};
    for (const key in value) {
      if (Object.hasOwnProperty.call(value, key)) {
        result[key] = this._pgToNative(value[key]);
      }
    }
    return result;
  }
}
