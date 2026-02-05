import { getNeo4jAuth } from '../../utils/setup';
import { Neo4jConnectionModule } from '../../../src/neo4j/Neo4jConnectionModule';
import { DEFAULT_CONNECTION_CONFIG, QueryCallback, QueryParams } from '../../../src/generalized/interfaces';
import { NeodashRecord } from '../../../src/generalized/NeodashRecord';

describe('Neo4jConnectionModule - setSchema', () => {
  test('should extract schema from MovieDB sample data with ACTED_IN relation', async () => {
    const config = getNeo4jAuth();
    const connection = new Neo4jConnectionModule(config);

    const queryParams: QueryParams = {
      query: `
      MATCH (p:Person)-[r:ACTED_IN]->(m:Movie)
      RETURN p, r, m
      LIMIT 1
    `,
      params: {},
    };

    const queryCallback: QueryCallback<any> = {
      onSuccess: (result: NeodashRecord[]) => {
        expect(result.length).toBeGreaterThan(0);
      },
      onFail: (error) => {
        console.error('Query failed:', error);
        throw error;
      },
      setSchema: (schema) => {
        // schema should include Person, Movie, and ACTED_IN with at least some properties
        expect(schema).toEqual(
          expect.arrayContaining([
            expect.arrayContaining(['Person']),
            expect.arrayContaining(['Movie']),
            expect.arrayContaining(['ACTED_IN']),
          ])
        );
      },
    };

    await connection.runQuery(queryParams, queryCallback, {
      ...DEFAULT_CONNECTION_CONFIG,
      parseToNeodashRecord: true,
      useNodePropsAsFields: true,
    });
  });

  test('should extract schema from a path structure', async () => {
    const config = getNeo4jAuth();
    const connection = new Neo4jConnectionModule(config);

    const queryParams: QueryParams = {
      query: `
      MATCH path = (p:Person)-[:ACTED_IN]->(m:Movie)
      RETURN path
      LIMIT 1
    `,
      params: {},
    };

    const queryCallback: QueryCallback<any> = {
      onSuccess: (result: NeodashRecord[]) => {
        expect(result.length).toBeGreaterThan(0);
      },
      onFail: (error) => {
        console.error('Query failed:', error);
        throw error;
      },
      setSchema: (schema) => {
        // Since valueIsPath will be hit via extract function on `path`
        expect(schema).toEqual(
          expect.arrayContaining([expect.arrayContaining(['Person']), expect.arrayContaining(['Movie'])])
        );
      },
    };

    await connection.runQuery(queryParams, queryCallback, {
      ...DEFAULT_CONNECTION_CONFIG,
      parseToNeodashRecord: true,
      useNodePropsAsFields: true,
    });
  });

  test('should handle undefined field gracefully (field === undefined)', async () => {
    const config = getNeo4jAuth();
    const connection = new Neo4jConnectionModule(config);

    const queryParams: QueryParams = {
      query: `RETURN null AS missingField`,
      params: {},
    };

    const queryCallback: QueryCallback<any> = {
      onSuccess: (result: NeodashRecord[]) => {
        expect(result.length).toBe(1);
      },
      onFail: (error) => {
        console.error('Query failed:', error);
        throw error;
      },
      setSchema: (schema) => {
        // Should not crash, but likely return an empty schema
        expect(schema).toEqual([]);
      },
    };

    await connection.runQuery(queryParams, queryCallback, {
      ...DEFAULT_CONNECTION_CONFIG,
      parseToNeodashRecord: true,
      useNodePropsAsFields: true,
    });
  });

  test('should recurse over array of nodes from MovieDB (valueIsArray === true)', async () => {
    const config = getNeo4jAuth();
    const connection = new Neo4jConnectionModule(config);

    const queryParams: QueryParams = {
      query: `
      MATCH (p:Person)
      WITH collect(p) AS people
      RETURN people
      LIMIT 1
    `,
      params: {},
    };

    const queryCallback: QueryCallback<any> = {
      onSuccess: (result: NeodashRecord[]) => {
        expect(result.length).toBe(1);
      },
      onFail: (error) => {
        console.error('Query failed:', error);
        throw error;
      },
      setSchema: (schema) => {
        expect(schema).toEqual(
          expect.arrayContaining([
            expect.arrayContaining(['Person']), // at least a label
          ])
        );
      },
    };

    await connection.runQuery(queryParams, queryCallback, {
      ...DEFAULT_CONNECTION_CONFIG,
      parseToNeodashRecord: true,
      useNodePropsAsFields: true,
    });
  });
});
