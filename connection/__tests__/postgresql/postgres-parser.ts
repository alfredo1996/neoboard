import { PostgresRecordParser } from '../../src/postgresql/PostgresRecordParser';
import { NeodashRecord } from '../../src/generalized/NeodashRecord';

describe('PostgreSQL Record Parser', () => {
  let parser: PostgresRecordParser;

  beforeEach(() => {
    parser = new PostgresRecordParser();
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

  test('should inherit default isGraphObject returning false', () => {
    expect(parser['isGraphObject']({})).toBe(false);
    expect(parser['isGraphObject']([])).toBe(false);
    expect(parser['isGraphObject']('string')).toBe(false);
    expect(parser['isGraphObject'](null)).toBe(false);
  });

  test('should inherit default parseGraphObject returning value as is', () => {
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
});
