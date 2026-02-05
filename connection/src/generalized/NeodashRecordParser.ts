import { NeodashRecord } from './NeodashRecord';

export abstract class NeodashRecordParser {
  /**
   * Parses a list of records.
   * @param _records The records to parse.
   * @returns The parsed records.
   */
  bulkParse(_records: Record<any, any>[]): NeodashRecord[] {
    return _records.map((record) => this._parse(record));
  }

  /**
   * Parses a single record.
   * @param _record The record to parse.
   * @returns The parsed record.
   */
  abstract _parse(_record: Record<any, any>): NeodashRecord;

  /**
   * Checks if the given value is a primitive type (e.g., string, number, boolean).
   *
   * @param value - The value to check.
   * @returns True if the value is a primitive type, false otherwise.
   */
  abstract isPrimitive(value): boolean;

  /**
   * Checks if the given value is a temporal type (e.g., Date, DateTime).
   *
   * @param value - The value to check.
   * @returns True if the value is a temporal type, false otherwise.
   */
  abstract isTemporal(value): boolean;

  /**
   * Checks if the given value is an object (excluding null and primitive types).
   *
   * @param value - The value to check.
   * @returns True if the value is an object, false otherwise.
   */
  abstract isGraphObject(value): boolean;

  /**
   * Parses a primitive value (e.g., string, number, boolean).
   *
   * @param value - The value to parse.
   * @returns The parsed value (in the case of primitives, it may just return the value as is).
   */
  abstract parsePrimitive(value): any;

  /**
   * Parses a temporal value (e.g., Date, DateTime).
   *
   * @param value - The temporal value to parse.
   * @returns The parsed temporal value, typically in a standardized format.
   */
  abstract parseTemporal(value): any;

  /**
   * Parses an object, typically extracting its properties or transforming it in some way.
   *
   * @param value - The object to parse.
   * @returns The parsed object.
   */
  abstract parseGraphObject(value): any;
}
