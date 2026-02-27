import { NeodashRecord } from './NeodashRecord';

export abstract class NeodashRecordParser {
  /**
   * Parses a list of records.
   * @param _records The records to parse.
   * @returns The parsed records.
   */
  bulkParse(_records: Record<string, unknown>[]): NeodashRecord[] {
    return _records.map((record) => this._parse(record));
  }

  /**
   * Parses a single record.
   * @param _record The record to parse.
   * @returns The parsed record.
   */
  abstract _parse(_record: Record<string, unknown>): NeodashRecord;

  /**
   * Checks if the given value is a primitive type (e.g., string, number, boolean).
   *
   * @param value - The value to check.
   * @returns True if the value is a primitive type, false otherwise.
   */
  abstract isPrimitive(value: unknown): boolean;

  /**
   * Checks if the given value is a temporal type (e.g., Date, DateTime).
   *
   * @param value - The value to check.
   * @returns True if the value is a temporal type, false otherwise.
   */
  abstract isTemporal(value: unknown): boolean;

  /**
   * Checks if the given value is a graph object (e.g., Neo4j Node, Relationship).
   * Default implementation returns false (suitable for non-graph databases).
   *
   * @param value - The value to check.
   * @returns True if the value is a graph object, false otherwise.
   */
  isGraphObject(_value: unknown): boolean {
    return false;
  }

  /**
   * Parses a primitive value (e.g., string, number, boolean).
   *
   * @param value - The value to parse.
   * @returns The parsed value (in the case of primitives, it may just return the value as is).
   */
  abstract parsePrimitive(value: unknown): unknown;

  /**
   * Parses a temporal value (e.g., Date, DateTime).
   *
   * @param value - The temporal value to parse.
   * @returns The parsed temporal value, typically in a standardized format.
   */
  abstract parseTemporal(value: unknown): unknown;

  /**
   * Parses a graph object. Default implementation returns the value as-is
   * (suitable for non-graph databases).
   *
   * @param value - The object to parse.
   * @returns The parsed object.
   */
  parseGraphObject(value: unknown): unknown {
    return value;
  }
}
