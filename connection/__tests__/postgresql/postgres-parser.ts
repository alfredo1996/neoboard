import { PostgresRecordParser } from '../../src/postgresql/PostgresRecordParser';
import { NeodashRecord } from '../../src/generalized/NeodashRecord';
import type { FieldDef } from 'pg';

describe('PostgreSQL Record Parser', () => {
  let parser: PostgresRecordParser;

  beforeEach(() => {
    parser = new PostgresRecordParser();
  });

  test('should parse basic query results', () => {
    const fields = [
      { name: 'id', dataTypeID: 23 } as unknown as FieldDef,
      { name: 'name', dataTypeID: 25 } as unknown as FieldDef,
    ];

    const rows = [
      { id: 1, name: 'Alice' },
      { id: 2, name: 'Bob' },
    ];

    const result = parser.parse(fields, rows, 2);

    expect(result.fields).toHaveLength(2);
    expect(result.fields[0].name).toBe('id');
    expect(result.fields[0].type).toBe('number');
    expect(result.fields[1].name).toBe('name');
    expect(result.fields[1].type).toBe('string');
    expect(result.records).toHaveLength(2);
    expect(result.summary.rowCount).toBe(2);
    expect(result.summary.database).toBe('postgresql');
  });

  test('should handle undefined fields', () => {
    const rows = [{ id: 1, name: 'Alice' }];

    const result = parser.parse(undefined, rows, 1);

    expect(result.fields).toHaveLength(0);
    expect(result.records).toHaveLength(1);
    expect(result.summary.rowCount).toBe(1);
  });

  test('should map PostgreSQL types correctly', () => {
    const fields = [
      { name: 'bool_col', dataTypeID: 16 } as unknown as FieldDef,
      { name: 'int_col', dataTypeID: 23 } as unknown as FieldDef,
      { name: 'float_col', dataTypeID: 700 } as unknown as FieldDef,
      { name: 'text_col', dataTypeID: 25 } as unknown as FieldDef,
      { name: 'date_col', dataTypeID: 1082 } as unknown as FieldDef,
      { name: 'json_col', dataTypeID: 3802 } as unknown as FieldDef,
      { name: 'uuid_col', dataTypeID: 2950 } as unknown as FieldDef,
      { name: 'array_col', dataTypeID: 1015 } as unknown as FieldDef,
    ];

    const rows = [{}];

    const result = parser.parse(fields, rows, 1);

    expect(result.fields[0].type).toBe('boolean');
    expect(result.fields[1].type).toBe('number');
    expect(result.fields[2].type).toBe('number');
    expect(result.fields[3].type).toBe('string');
    expect(result.fields[4].type).toBe('date');
    expect(result.fields[5].type).toBe('object');
    expect(result.fields[6].type).toBe('string');
    expect(result.fields[7].type).toBe('array');
  });

  test('should handle unknown types as string', () => {
    const fields = [{ name: 'unknown_col', dataTypeID: 99999 } as unknown as FieldDef];

    const rows = [{}];

    const result = parser.parse(fields, rows, 1);

    expect(result.fields[0].type).toBe('string');
  });

  test('should include execution metadata', () => {
    const fields = [{ name: 'id', dataTypeID: 23 } as unknown as FieldDef];
    const rows = [{ id: 1 }];

    const result = parser.parseWithMetadata(fields, rows, 1);

    expect(result.summary.queryType).toBe('read');
    expect(result.summary.database).toBe('postgresql');
    expect(result.summary.executionTime).toBeGreaterThanOrEqual(0);
  });

  test('should implement _parse to return NeodashRecord', () => {
    const row = { id: 1, name: 'Alice', age: 30 };

    const result = parser['_parse'](row);

    expect(result).toBeInstanceOf(NeodashRecord);
    expect(result.id).toBe(1);
    expect(result.name).toBe('Alice');
    expect(result.age).toBe(30);
  });

  test('should implement bulkParse to return array of NeodashRecords', () => {
    const rows = [
      { id: 1, name: 'Alice' },
      { id: 2, name: 'Bob' },
    ];

    const results = parser.bulkParse(rows);

    expect(Array.isArray(results)).toBe(true);
    expect(results).toHaveLength(2);
    expect(results[0]).toBeInstanceOf(NeodashRecord);
    expect(results[1]).toBeInstanceOf(NeodashRecord);
    expect(results[0].name).toBe('Alice');
    expect(results[1].name).toBe('Bob');
  });

  test('should implement isPrimitive correctly', () => {
    expect(parser['isPrimitive']('string')).toBe(true);
    expect(parser['isPrimitive'](123)).toBe(true);
    expect(parser['isPrimitive'](true)).toBe(true);
    expect(parser['isPrimitive'](BigInt(123))).toBe(true);
    expect(parser['isPrimitive'](null)).toBe(false);
    expect(parser['isPrimitive'](undefined)).toBe(false);
    expect(parser['isPrimitive']({})).toBe(false);
    expect(parser['isPrimitive']([])).toBe(false);
  });

  test('should implement parsePrimitive correctly', () => {
    expect(parser['parsePrimitive']('test')).toBe('test');
    expect(parser['parsePrimitive'](123)).toBe(123);
    expect(parser['parsePrimitive'](true)).toBe(true);
    expect(parser['parsePrimitive'](BigInt(999))).toBe(BigInt(999));
  });

  test('should implement isTemporal correctly', () => {
    const date = new Date();
    expect(parser['isTemporal'](date)).toBe(true);
    expect(parser['isTemporal']('2023-01-01')).toBe(false);
    expect(parser['isTemporal'](123)).toBe(false);
    expect(parser['isTemporal'](null)).toBe(false);
  });

  test('should implement parseTemporal correctly', () => {
    const date = new Date('2023-01-01T12:00:00Z');
    const result = parser['parseTemporal'](date);
    expect(result).toBeInstanceOf(Date);
    expect(result).toBe(date);
  });

  test('should implement isGraphObject to return false', () => {
    expect(parser['isGraphObject']({})).toBe(false);
    expect(parser['isGraphObject']([])).toBe(false);
    expect(parser['isGraphObject']('string')).toBe(false);
    expect(parser['isGraphObject'](null)).toBe(false);
  });

  test('should implement parseGraphObject to return value as is', () => {
    const obj = { key: 'value' };
    expect(parser['parseGraphObject'](obj)).toBe(obj);
  });

  test('should handle nested objects in _parse', () => {
    const row = {
      id: 1,
      metadata: { created: new Date(), tags: ['a', 'b'] },
      scores: [10, 20, 30],
    };

    const result = parser['_parse'](row);

    expect(result).toBeInstanceOf(NeodashRecord);
    expect(result.id).toBe(1);
    expect(result.metadata).toBeDefined();
    expect(Array.isArray(result.scores)).toBe(true);
  });

  test('should handle null and undefined values', () => {
    const row = { id: 1, name: null, age: undefined };

    const result = parser['_parse'](row);

    expect(result).toBeInstanceOf(NeodashRecord);
    expect(result.id).toBe(1);
    expect(result.name).toBeNull();
    expect(result.age).toBeUndefined();
  });

  test('should return existing NeodashRecord unchanged in _parse', () => {
    const existingRecord = new NeodashRecord({ id: 1, name: 'Test' });

    const result = parser['_parse'](existingRecord as any);

    expect(result).toBe(existingRecord);
  });

  test('parseWithMetadata should return NeodashRecord array', () => {
    const fields = [
      { name: 'id', dataTypeID: 23 } as unknown as FieldDef,
      { name: 'name', dataTypeID: 25 } as unknown as FieldDef,
    ];

    const rows = [
      { id: 1, name: 'Alice' },
      { id: 2, name: 'Bob' },
    ];

    const result = parser.parseWithMetadata(fields, rows, 2);

    expect(result.records).toHaveLength(2);
    expect(result.records[0]).toBeInstanceOf(NeodashRecord);
    expect(result.records[1]).toBeInstanceOf(NeodashRecord);
    expect(result.records[0].name).toBe('Alice');
    expect(result.fields).toHaveLength(2);
    expect(result.summary.rowCount).toBe(2);
  });
});
