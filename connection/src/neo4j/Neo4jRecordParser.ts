import { NeodashRecordParser } from '../generalized/NeodashRecordParser';
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
} from 'neo4j-driver';
import { NeodashRecord } from '../generalized/NeodashRecord';

/**
 * Neo4jRecordParser
 *
 * Parses Neo4j records into plain JavaScript objects,
 * simplifying the handling of integers, nodes, relationships, etc.
 */
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
  _parse(_record: Record<string, unknown> | NeodashRecord | Neo4jRecord<any, any>): NeodashRecord {
    // Parsing the record twice should return the same record
    if (_record instanceof NeodashRecord) {
      return _record;
    }
    const parsed: Record<string, any> = {};

    for (const key of _record.keys) {
      const value = _record.get(key);
      parsed[key] = this.__neo4jToNative(value);
    }
    return new NeodashRecord(parsed);
  }

  /**
   * Converts Neo4j data types to native JavaScript types
   * @param {any} value - Value from Neo4j result
   * @return {any} - Value converted to JavaScript native type
   */
  private __neo4jToNative(value: any): any {
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
    } else if (typeof value === 'object') {
      return this.convertPlainObject(value);
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
    return isInt(value) || typeof value === 'boolean' || typeof value === 'string' || typeof value === 'number';
  }

  /**
   * Converts a Neo4j primitive type to a native JavaScript type.
   * For Neo4j Integer values, converts to number if in safe range,
   * otherwise returns as string to avoid precision loss.
   *
   * @param {any} value - The Neo4j primitive value to convert.
   * @returns {number|string|boolean|bigint} The JavaScript representation of the value.
   */

  parsePrimitive(value: unknown): number | string | boolean | bigint {
    if (isInt(value)) {
      return value.inSafeRange() ? value.toNumber() : value.toBigInt();
    }

    if (typeof value === 'boolean' || typeof value === 'string' || typeof value === 'number') {
      return value;
    }

    throw new Error(`Unexpected value passed to parsePrimitive: ${typeof value}`);
  }

  /**
   * Determines if the provided value is a Neo4j temporal type.
   * Includes types like Date, DateTime, LocalTime, Time, Duration, etc.
   *
   * @param {any} value - The value to check.
   * @returns {boolean} True if the value is a known Neo4j temporal type.
   */
  isTemporal(value: unknown): boolean {
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
   * - Neo4jDate: JS Date (year, month, day)
   * - DateTime: parsed from .toString() to retain timezone
   * - LocalDateTime: JS Date with manual component mapping
   * - Time and LocalTime: formatted string (HH:mm:ss.nnnnnnnnn)
   * - Duration: plain JS object with numeric fields
   *
   * @param {object} value - A temporal value from Neo4j, possibly with fields like year, month, hour, etc.
   * @returns {Date|string|object} A native JS object or string, depending on the type.
   */
  parseTemporal(value: {
    year: any;
    month: number;
    day: any;
    hour: any;
    minute: any;
    second: any;
    nanosecond: number;
    months: any;
    days: any;
    seconds: any;
    nanoseconds: any;
  }) {
    // TODO: This is a fellony, to redo. Probably the best way is to reuse the parser to get the types out. The example is in getRecordType
    if (value instanceof Neo4jDate) {
      return value;
    }

    if (value instanceof Time) {
      const offsetSeconds = value.timeZoneOffsetSeconds.toNumber();
      const offsetHours = Math.floor(Math.abs(offsetSeconds) / 3600);
      const offsetMinutes = Math.floor((Math.abs(offsetSeconds) % 3600) / 60);
      const sign = offsetSeconds >= 0 ? '+' : '-';

      const pad = (num) => String(num).padStart(2, '0');

      return `${pad(value.hour)}:${pad(value.minute)}:${pad(value.second)}.${value.nanosecond
        .toString()
        .padStart(9, '0')}${sign}${pad(offsetHours)}:${pad(offsetMinutes)}`;
    }

    if (value instanceof LocalTime) {
      return `${value.hour}:${value.minute}:${value.second}.${value.nanosecond}`;
    }

    if (value instanceof DateTime) {
      // DateTime includes timezone offset (e.g., +02:00), which is critical for accurate conversion.
      // We use .toString() to get the full ISO-8601 string, then construct a JS Date from it.
      // This preserves the original timezone offset during parsing.
      return value;
    }

    if (value instanceof LocalDateTime) {
      return new Date(
        value.year.toNumber(),
        value.month.toNumber() - 1,
        value.day.toNumber(),
        value.hour.toNumber(),
        value.minute.toNumber(),
        value.second.toNumber(),
        Math.floor(value.nanosecond.toNumber() / 1e6)
      );
    }

    if (value instanceof Duration) {
      return {
        months: value.months.toNumber(),
        days: value.days.toNumber(),
        seconds: value.seconds.toNumber(),
        nanoseconds: value.nanoseconds.toNumber(),
      };
    }

    return value;
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
        properties: this.convertPlainObject(value.properties as object),
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
        properties: this.convertPlainObject(value.properties as object),
      };
    }

    if (value instanceof Path) {
      return value;
    }

    if (value instanceof PathSegment) {
      return value;
    }

    if (value instanceof Point) {
      const point = {
        srid: this.__neo4jToNative(value.srid),
        x: this.__neo4jToNative(value.x),
        y: this.__neo4jToNative(value.y),
      };

      if (value.z !== undefined) {
        point['z'] = this.__neo4jToNative(value.z);
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
  convertPlainObject(value: object): object {
    const result = {};
    for (const key in value) {
      if (Object.hasOwn(value, key)) {
        result[key] = this.__neo4jToNative(value[key]);
      }
    }
    return result;
  }
}
