import { NeodashRecordParser } from '../generalized/NeodashRecordParser';
import { NeodashRecord } from '../generalized/NeodashRecord';
import type { FieldDef } from 'pg';

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
  _parse(_record: Record<any, any>): NeodashRecord {
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
  isPrimitive(value: any): boolean {
    const type = typeof value;
    return type === 'boolean' || type === 'string' || type === 'number' || type === 'bigint';
  }

  /**
   * Converts a primitive type to native JavaScript.
   * @param value - The primitive value to convert
   * @returns The JavaScript representation of the value
   */
  parsePrimitive(value: any): number | string | boolean | bigint {
    // PostgreSQL driver already converts most primitives correctly
    return value;
  }

  /**
   * Determines if the provided value is a temporal type (Date).
   * @param value - The value to check
   * @returns True if the value is a Date
   */
  isTemporal(value: any): boolean {
    return value instanceof Date;
  }

  /**
   * Converts temporal types to JavaScript Date or string representation.
   * @param value - A temporal value from PostgreSQL
   * @returns A native JS Date or ISO string
   */
  parseTemporal(value: any): Date | string {
    if (value instanceof Date) {
      return value;
    }
    return value;
  }

  /**
   * Determines if the provided value is a graph object.
   * PostgreSQL doesn't have native graph objects like Neo4j, so this always returns false.
   * @param value - The value to check
   * @returns Always false for PostgreSQL
   */
  isGraphObject(value: any): boolean {
    // PostgreSQL doesn't have native graph objects like nodes/relationships
    return false;
  }

  /**
   * Parses graph objects (not applicable for PostgreSQL).
   * @param value - The value to parse
   * @returns The value as is
   */
  parseGraphObject(value: any): any {
    // PostgreSQL doesn't have graph objects, return as is
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

  /**
   * Parses PostgreSQL query results with metadata.
   * This is a helper method that provides additional metadata alongside NeodashRecords.
   * @param fields - PostgreSQL field metadata
   * @param rows - Query result rows
   * @param totalCount - Total number of rows
   * @returns Parsed result with fields, records, and summary
   */
  parseWithMetadata(fields: FieldDef[] | undefined, rows: any[], totalCount: number): any {
    const parsedRecords = this.bulkParse(rows);

    return {
      fields: fields
        ? fields.map((field) => ({
            name: field.name,
            type: this.pgTypeToColumnType(field.dataTypeID),
          }))
        : [],
      records: parsedRecords,
      summary: {
        rowCount: totalCount,
        executionTime: 0,
        queryType: 'read',
        database: 'postgresql',
      },
    };
  }

  /**
   * Legacy parse method for backward compatibility.
   * Parses PostgreSQL query results into a format with fields, records, and summary.
   * @param fields - PostgreSQL field metadata
   * @param rows - Query result rows
   * @param totalCount - Total number of rows
   * @returns Parsed result in legacy format
   * @deprecated Use parseWithMetadata instead
   */
  parse(fields: FieldDef[] | undefined, rows: any[], totalCount: number): any {
    if (!fields) {
      return {
        fields: [],
        records: rows,
        summary: {
          rowCount: totalCount,
          executionTime: 0,
          queryType: 'read',
          database: 'postgresql',
        },
      };
    }

    return {
      fields: fields.map((field) => ({
        name: field.name,
        type: this.pgTypeToColumnType(field.dataTypeID),
      })),
      records: rows,
      summary: {
        rowCount: totalCount,
        executionTime: 0,
        queryType: 'read',
        database: 'postgresql',
      },
    };
  }

  /**
   * Maps PostgreSQL type OIDs to generic column types.
   * Reference: https://github.com/brianc/node-postgres/blob/master/packages/pg-types/builtins.js
   * @param typeId - PostgreSQL type OID
   * @returns Generic column type
   */
  private pgTypeToColumnType(typeId: number): string {
    // Common PostgreSQL OID mappings
    const typeMap: Record<number, string> = {
      // Numeric types
      16: 'boolean', // bool
      20: 'number', // int8
      21: 'number', // int2
      23: 'number', // int4
      700: 'number', // float4
      701: 'number', // float8
      1700: 'number', // numeric

      // String types
      25: 'string', // text
      1042: 'string', // bpchar (char)
      1043: 'string', // varchar

      // Date/Time types
      1082: 'date', // date
      1083: 'date', // time
      1114: 'date', // timestamp
      1184: 'date', // timestamptz
      1266: 'date', // timetz

      // JSON types
      114: 'object', // json
      3802: 'object', // jsonb

      // Array types
      1007: 'array', // int4[]
      1015: 'array', // varchar[]
      1005: 'array', // int2[]
      1016: 'array', // int8[]
      1021: 'array', // float4[]
      1022: 'array', // float8[]
      1000: 'array', // bool[]
      1009: 'array', // text[]
      101: 'array', // _json

      // UUID
      2950: 'string', // uuid

      // Special types
      17: 'object', // bytea
    };

    return typeMap[typeId] || 'string';
  }
}
