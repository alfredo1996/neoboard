/**
 * Base class for a connector's record parser: what turns the driver's rows
 * into the plain rows of the row value contract (`row-value.ts`).
 *
 * A parsed row is a plain object — column name → row value. It used to be a
 * `NeodashRecord` Proxy, deleted in #1904: nothing read it as anything but a
 * plain object, and with no `ownKeys` trap `Object.keys(row)` answered
 * `["record"]`.
 */
export abstract class NeodashRecordParser {
  /**
   * Parses a list of records — the ONE pass over a result's rows. Canonicalise
   * inside it; a second pass costs up to 100 000 rows per query.
   * @param _records The records to parse.
   * @returns The parsed rows.
   */
  bulkParse(_records: Record<string, unknown>[]): Record<string, unknown>[] {
    return _records.map((record) => this._parse(record));
  }

  /**
   * Parses a single record.
   * @param _record The record to parse.
   * @returns The parsed row.
   */
  abstract _parse(_record: Record<string, unknown>): Record<string, unknown>;

  /**
   * Recursively converts all properties of a plain JavaScript object
   * using the provided converter function.
   *
   * @param value - The object to recursively process.
   * @param convert - A function to apply to each property value.
   * @returns A fully converted JavaScript object.
   */
  protected convertPlainObject(
    value: object,
    convert: (v: unknown) => unknown,
  ): Record<string, unknown> {
    const result: Record<string, unknown> = {};
    for (const key in value) {
      if (Object.hasOwn(value, key)) {
        result[key] = convert((value as Record<string, unknown>)[key]);
      }
    }
    return result;
  }
}
