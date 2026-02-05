import { NeodashRecord } from '../../src/generalized/NeodashRecord';

describe('NeodashRecord Movie node CRUD operations', () => {
  test('Create: should allow adding new properties dynamically to a movie record', () => {
    const movie = new NeodashRecord({});
    movie['title'] = 'The Matrix';
    expect(movie['title']).toBe('The Matrix');
  });

  test('Read: should allow reading existing movie properties', () => {
    const movie = new NeodashRecord({
      title: 'The Matrix',
      released: 1999,
      tagline: 'Welcome to the Real World',
    });

    expect(movie['title']).toBe('The Matrix');
    expect(movie['released']).toBe(1999);
    expect(movie['tagline']).toBe('Welcome to the Real World');
  });

  test('Update: should allow updating existing movie properties', () => {
    const movie = new NeodashRecord({
      title: 'The Matrix',
      released: 1999,
    });

    movie['released'] = 2000;
    movie['tagline'] = 'A new reality begins';

    expect(movie['released']).toBe(2000);
    expect(movie['tagline']).toBe('A new reality begins');
  });

  test('Read: should return undefined for non-existing movie property', () => {
    const movie = new NeodashRecord({
      title: 'The Matrix',
      released: 1999,
    });

    expect(movie['director']).toBeUndefined(); // not set
  });

  test('should expose toObject() via proxy', () => {
    const record = new NeodashRecord({ name: 'Alice', age: 30 });
    const obj = record.toObject();
    expect(obj).toEqual({ name: 'Alice', age: 30 });
  });

  test('should expose toJSON() via JSON.stringify (proxy trap)', () => {
    const record = new NeodashRecord({ name: 'Bob', role: 'Agent' });
    const json = JSON.stringify(record);
    expect(json).toBe(JSON.stringify({ name: 'Bob', role: 'Agent' }));
  });

  test('should expose keys via Object.keys (proxy trap ownKeys)', () => {
    const record = new NeodashRecord({ title: 'Inception', year: 2010 });
    const keys = Object.keys(record.toObject());
    expect(keys).toEqual(['title', 'year']);
  });

  test('should expose keys via getFields (proxy trap getFields)', () => {
    const record = new NeodashRecord({ title: 'Inception', year: 2010 });
    const keys = record.getFields();
    expect(keys).toEqual(['title', 'year']);
  });
});
