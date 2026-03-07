import { Neo4jRecordParser } from '../../../src/neo4j/Neo4jRecordParser';
import neo4j from 'neo4j-driver';

const { int } = neo4j;

/** Helper to build a fake Neo4j record for the parser. */
function fakeRecord(key: string, value: unknown) {
  return {
    keys: [key],
    get: (k: string) => (k === key ? value : undefined),
  } as any;
}

describe('Neo4jRecordParser - Temporal Conversion', () => {
  const parser = new Neo4jRecordParser();

  it('converts Neo4jDate to "YYYY-MM-DD" string', () => {
    const date = new neo4j.types.Date(int(2024), int(3), int(15));
    const result = parser._parse(fakeRecord('d', date));
    expect(result['d']).toBe('2024-03-15');
  });

  it('pads single-digit month and day in Neo4jDate', () => {
    const date = new neo4j.types.Date(int(2024), int(1), int(9));
    const result = parser._parse(fakeRecord('d', date));
    expect(result['d']).toBe('2024-01-09');
  });

  it('converts DateTime to "YYYY-MM-DD HH:mm:ss" string', () => {
    const dt = new neo4j.types.DateTime(
      int(2024),
      int(6),
      int(1),
      int(14),
      int(30),
      int(5),
      int(0),
      int(3600), // +01:00 offset
    );
    const result = parser._parse(fakeRecord('dt', dt));
    expect(result['dt']).toBe('2024-06-01 14:30:05');
  });

  it('pads single-digit hour/minute/second in DateTime', () => {
    const dt = new neo4j.types.DateTime(
      int(2024),
      int(1),
      int(2),
      int(3),
      int(4),
      int(5),
      int(0),
      int(0),
    );
    const result = parser._parse(fakeRecord('dt', dt));
    expect(result['dt']).toBe('2024-01-02 03:04:05');
  });

  it('returns no {low, high} sub-objects in Neo4jDate output', () => {
    const date = new neo4j.types.Date(int(2024), int(12), int(25));
    const result = parser._parse(fakeRecord('d', date));
    const val = result['d'];
    expect(typeof val).toBe('string');
    expect(val).not.toHaveProperty('low');
  });

  it('returns no {low, high} sub-objects in DateTime output', () => {
    const dt = new neo4j.types.DateTime(
      int(2024),
      int(12),
      int(25),
      int(10),
      int(30),
      int(0),
      int(0),
      int(0),
    );
    const result = parser._parse(fakeRecord('dt', dt));
    const val = result['dt'];
    expect(typeof val).toBe('string');
    expect(val).not.toHaveProperty('low');
  });

  it('still converts LocalDateTime to JS Date (regression guard)', () => {
    const ldt = new neo4j.types.LocalDateTime(
      int(2024),
      int(3),
      int(15),
      int(10),
      int(30),
      int(0),
      int(0),
    );
    const result = parser._parse(fakeRecord('ldt', ldt));
    expect(result['ldt']).toBeInstanceOf(Date);
    expect((result['ldt'] as Date).getFullYear()).toBe(2024);
  });
});
