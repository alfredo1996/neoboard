import { getNeo4jAuth } from '../../utils/setup';
import { Neo4jConnectionModule } from '../../../src/neo4j/Neo4jConnectionModule';
import { DEFAULT_CONNECTION_CONFIG, QueryCallback, QueryParams } from '../../../src/generalized/interfaces';
import { DateTime } from 'neo4j-driver';
import { NeodashRecord } from '../../../src/generalized/NeodashRecord';

describe('Neo4jRecordParser - Objects Parsing', () => {
  test('should correctly find the movie "The Matrix" as NODE', async () => {
    const config = getNeo4jAuth();

    const connection = new Neo4jConnectionModule(config);

    const queryParams: QueryParams = {
      query: 'MATCH (m:Movie) WHERE m.title = "The Matrix" RETURN m LIMIT 1',
      params: {},
    };

    const queryCallback: QueryCallback<any> = {
      onSuccess: (result: NeodashRecord[]) => {
        const movieNode = result[0]['m'];

        // After normalization, movieNode is a plain object (not a Node instance)
        expect(typeof movieNode).toBe('object');
        expect(Array.isArray(movieNode['labels'])).toBe(true);
        expect(movieNode['labels']).toContain('Movie');
        const movieNodeProperties = movieNode['properties'];
        // Assertions
        expect(movieNodeProperties.title).toBe('The Matrix');
        expect(movieNodeProperties.tagline).toBe('Welcome to the Real World');
        // released is now a native JS number after normalization
        expect(movieNodeProperties.released).toBe(1999);

        expect(typeof movieNodeProperties.title).toBe('string');
        expect(typeof movieNodeProperties.tagline).toBe('string');
        expect(typeof movieNodeProperties.released).toBe('number');
      },
      onFail: (error) => {
        console.error('Error during query execution:', error);
        throw error;
      },
    };

    await connection.runQuery(queryParams, queryCallback, DEFAULT_CONNECTION_CONFIG);
  });

  test('should correctly find the relation "ACTED_IN" for movie "The Matrix"', async () => {
    const config = getNeo4jAuth();

    const connection = new Neo4jConnectionModule(config);

    const queryParams: QueryParams = {
      query: 'MATCH (p:Person)-[r:ACTED_IN]->(m:Movie) WHERE m.title = "The Matrix" RETURN r LIMIT 1',
      params: {},
    };

    const queryCallback: QueryCallback<any> = {
      onSuccess: (result: NeodashRecord[]) => {
        const relationship = result[0]['r'];
        // After normalization, relationship is a plain object (not a Relationship instance)
        expect(typeof relationship).toBe('object');

        expect(relationship).toMatchObject({
          identity: expect.any(Number),
          start: expect.any(Number),
          end: expect.any(Number),
          type: expect.any(String),
          properties: { roles: expect.anything() },
          elementId: expect.any(String),
          startNodeElementId: expect.any(String),
          endNodeElementId: expect.any(String),
        });
      },
      onFail: (error) => {
        console.error('Error during query execution:', error);
        throw error;
      },
    };

    await connection.runQuery(queryParams, queryCallback, DEFAULT_CONNECTION_CONFIG);
  });

  test('should correctly parse a Neo4j Path with ordered nodes', async () => {
    const config = getNeo4jAuth();
    const connection = new Neo4jConnectionModule(config);

    const queryParams: QueryParams = {
      query: 'MATCH p = (a:Person)-[:ACTED_IN]->(m:Movie) WITH p ORDER BY ID(a), ID(m) RETURN p LIMIT 1',
      params: {},
    };

    const queryCallback: QueryCallback<any> = {
      onSuccess: () => {},
      onFail: (error) => {
        console.error('Error during query execution:', error);
        throw error;
      },
    };

    await connection.runQuery(queryParams, queryCallback, DEFAULT_CONNECTION_CONFIG);
  });

  test('should correctly parse complex array structures from Movie DB', async () => {
    const config = getNeo4jAuth();
    const connection = new Neo4jConnectionModule(config);

    const queryParams: QueryParams = {
      query: `
      MATCH (m:Movie)<-[:ACTED_IN]-(a:Person)
      WITH m.title AS movieTitle, collect(a.name) AS actorNames,
           [m.released, m.tagline, datetime()] AS mixedArray,
           [[1, 2], [3, 4]] AS nestedArray
      RETURN movieTitle, actorNames, mixedArray, nestedArray
      LIMIT 1
    `,
      params: {},
    };

    const queryCallback: QueryCallback<any> = {
      onSuccess: (parsed) => {
        const [record] = parsed;

        // Types
        expect(Array.isArray(record['actorNames'])).toBe(true);
        expect(Array.isArray(record['mixedArray'])).toBe(true);
        expect(Array.isArray(record['nestedArray'])).toBe(true);
        expect(Array.isArray(record['nestedArray'][0])).toBe(true);

        // Inner values
        expect(typeof record['mixedArray'][0]).toBe('number'); // released
        expect(typeof record['mixedArray'][1]).toBe('string'); // tagline
        expect(record['mixedArray'][2] instanceof DateTime).toBe(true); // datetime
      },
      onFail: (error) => {
        console.error('Error during query execution:', error);
        throw error;
      },
    };

    await connection.runQuery(queryParams, queryCallback, DEFAULT_CONNECTION_CONFIG);
  });

  test('should correctly parse a plain object with mixed types', async () => {
    const config = getNeo4jAuth();
    const connection = new Neo4jConnectionModule(config);

    const queryParams: QueryParams = {
      query: `
      RETURN {
        count: 123,
        flag: true,
        info: {
          label: "neo4j",
          created: datetime()
        }
      } AS data
    `,
      params: {},
    };

    const queryCallback: QueryCallback<any> = {
      onSuccess: (parsed) => {
        const data = parsed[0]['data'];

        expect(data.count).toBe(123);
        expect(data.flag).toBe(true);
        expect(data.info.label).toBe('neo4j');
        expect(data.info.created instanceof DateTime).toBe(true);
      },
      onFail: (error) => {
        console.error('Error during query execution:', error);
        throw error;
      },
    };

    await connection.runQuery(queryParams, queryCallback, DEFAULT_CONNECTION_CONFIG);
  });

  test('Run MATCH (p:Person {name: $name}) RETURN p with parameter', async () => {
    const config = getNeo4jAuth();
    const connection = new Neo4jConnectionModule(config);

    const queryParams: QueryParams = {
      query: 'MATCH (p:Person {name: $name}) RETURN p LIMIT 1',
      params: {
        name: 'Tom Hanks',
      },
    };

    const queryCallback: QueryCallback<any> = {
      onSuccess: (parsed) => {
        expect(parsed.length).toBe(1);

        const person = parsed[0]['p'];
        expect(person).toBeDefined();
        expect(person.labels).toContain('Person');
        expect(person.properties.name).toBe('Tom Hanks');
      },
      onFail: (err) => {
        console.error('Error executing parameterized query:', err);
        throw err;
      },
    };

    await connection.runQuery(queryParams, queryCallback, DEFAULT_CONNECTION_CONFIG);
  });

  test('should correctly parse a Neo4j Point value', async () => {
    const config = getNeo4jAuth();
    const connection = new Neo4jConnectionModule(config);

    const queryParams: QueryParams = {
      query: 'RETURN point({x: 1.2, y: 3.4, srid: 7203}) AS location',
      params: {},
    };

    const queryCallback: QueryCallback<any> = {
      onSuccess: (parsed) => {
        const location = parsed[0]['location'];
        expect(location).toBeDefined();

        expect(location.srid).toBe(7203);
        expect(location.x).toBe(1.2);
        expect(location.y).toBe(3.4);

        // Types
        expect(typeof location.x).toBe('number');
        expect(typeof location.y).toBe('number');
        expect(typeof location.srid).toBe('number');
      },
      onFail: (error) => {
        console.error('Error during query execution:', error);
        throw error;
      },
    };

    await connection.runQuery(queryParams, queryCallback, DEFAULT_CONNECTION_CONFIG);
  });

  test('should correctly parse a 3D Neo4j Point with z coordinate', async () => {
    const config = getNeo4jAuth();
    const connection = new Neo4jConnectionModule(config);

    const queryParams: QueryParams = {
      query: 'RETURN point({x: 10.5, y: 20.5, z: 5.0, srid: 9157}) AS location3D',
      params: {},
    };

    const queryCallback: QueryCallback<any> = {
      onSuccess: (parsed) => {
        const location = parsed[0]['location3D'];
        expect(location).toBeDefined();

        // Base fields
        expect(location['x']).toBe(10.5);
        expect(location['y']).toBe(20.5);
        expect(location['srid']).toBe(9157);
        expect(location['z']).toBe(5.0);
      },
      onFail: (err) => {
        console.error('Error during 3D point parsing:', err);
        throw err;
      },
    };

    await connection.runQuery(queryParams, queryCallback, DEFAULT_CONNECTION_CONFIG);
  });
});
