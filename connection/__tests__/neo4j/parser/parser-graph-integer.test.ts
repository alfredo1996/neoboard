import { Neo4jRecordParser } from '../../../src/neo4j/Neo4jRecordParser';
import neo4j from 'neo4j-driver';

const { Node, Relationship } = neo4j.types;
const { int } = neo4j;

describe('Neo4jRecordParser - Graph Integer Conversion', () => {
  const parser = new Neo4jRecordParser();

  it('converts Integer properties in Node to JS numbers', () => {
    const node = new Node(
      int(1),
      ['Person'],
      { age: int(30), score: int(1000), name: 'Alice' },
      'node:1'
    );

    // parseGraphObject is called internally by __neo4jToNative via isGraphObject
    // We test the full _parse path by wrapping the node in a NeodashRecord-like object
    const fakeRecord = {
      keys: ['n'],
      get: (key: string) => (key === 'n' ? node : undefined),
    } as any;

    const result = parser._parse(fakeRecord);
    const parsed = result['n'] as Record<string, unknown>;
    const props = parsed.properties as Record<string, unknown>;

    expect(typeof props.age).toBe('number');
    expect(props.age).toBe(30);
    expect(typeof props.score).toBe('number');
    expect(props.score).toBe(1000);
    expect(props.name).toBe('Alice');
  });

  it('converts Integer properties in Relationship to JS numbers', () => {
    const rel = new Relationship(
      int(10),
      int(1),
      int(2),
      'ACTED_IN',
      { weight: int(5) },
      'rel:10',
      'node:1',
      'node:2'
    );

    const fakeRecord = {
      keys: ['r'],
      get: (key: string) => (key === 'r' ? rel : undefined),
    } as any;

    const result = parser._parse(fakeRecord);
    const parsed = result['r'] as Record<string, unknown>;

    // The parsed relationship is a plain object, not a Relationship instance
    expect(typeof parsed.type).toBe('string');
    expect(parsed.type).toBe('ACTED_IN');
    const props = parsed.properties as Record<string, unknown>;
    expect(typeof props.weight).toBe('number');
    expect(props.weight).toBe(5);
  });

  it('converts identity of Node to JS number', () => {
    const node = new Node(int(42), ['Movie'], { title: 'The Matrix' }, 'node:42');

    const fakeRecord = {
      keys: ['n'],
      get: (key: string) => (key === 'n' ? node : undefined),
    } as any;

    const result = parser._parse(fakeRecord);
    const parsed = result['n'] as Record<string, unknown>;

    expect(parsed.identity).toBe(42);
    expect(parsed.elementId).toBe('node:42');
    expect(Array.isArray(parsed.labels)).toBe(true);
    expect((parsed.labels as string[])[0]).toBe('Movie');
  });
});
