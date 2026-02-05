import { getNeo4jAuth } from '../../utils/setup';
import { Neo4jConnectionModule } from '../../../src/neo4j/Neo4jConnectionModule';
import { DEFAULT_CONNECTION_CONFIG, QueryCallback, QueryParams } from '../../../src/generalized/interfaces';
import { NeodashRecord } from '../../../src/generalized/NeodashRecord';

describe('Neo4jConnectionModule - setFields', () => {
  test('getFields should return top-level keys when useNodePropsAsFields is false', async () => {
    const config = getNeo4jAuth();
    const connection = new Neo4jConnectionModule(config);

    const queryParams: QueryParams = {
      query: `
      MATCH (p:Person)-[:ACTED_IN]->(m:Movie)
      RETURN p AS person, m AS movie
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
      setFields: (fields) => {
        expect(fields).toEqual(expect.arrayContaining(['person', 'movie']));
      },
    };

    await connection.runQuery(queryParams, queryCallback, {
      ...DEFAULT_CONNECTION_CONFIG,
      parseToNeodashRecord: true,
      useNodePropsAsFields: false,
    });
  });

  test('getFields should extract node properties grouped by label', async () => {
    const config = getNeo4jAuth();
    const connection = new Neo4jConnectionModule(config);

    const queryParams: QueryParams = {
      query: `
      MATCH (p:Person)
      RETURN p
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
      setFields: (fields) => {
        expect(fields).toEqual(
          expect.arrayContaining([expect.arrayContaining(['Person', expect.stringMatching(/.*/)])])
        );
      },
    };

    await connection.runQuery(queryParams, queryCallback, {
      ...DEFAULT_CONNECTION_CONFIG,
      parseToNeodashRecord: true,
      useNodePropsAsFields: true,
    });
  });

  test('getFields should extract properties from path segments', async () => {
    const config = getNeo4jAuth();
    const connection = new Neo4jConnectionModule(config);

    const queryParams: QueryParams = {
      query: `
      MATCH p = (a:Person)-[:ACTED_IN]->(m:Movie)
      RETURN p
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
      setFields: (fields) => {
        expect(fields).toEqual(
          expect.arrayContaining([
            expect.arrayContaining(['Person', expect.stringMatching(/.*/)]),
            expect.arrayContaining(['Movie', expect.stringMatching(/.*/)]),
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

  test('getFields should extract from array of nodes (array traversal)', async () => {
    const config = getNeo4jAuth();
    const connection = new Neo4jConnectionModule(config);

    const queryParams: QueryParams = {
      query: `
      MATCH (a:Person), (b:Movie)
      RETURN [a, b] AS nodes
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
      setFields: (fields) => {
        expect(fields).toEqual(
          expect.arrayContaining([
            expect.arrayContaining(['Person', expect.stringMatching(/.*/)]),
            expect.arrayContaining(['Movie', expect.stringMatching(/.*/)]),
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

  test('getFields should return empty array when query returns no records', async () => {
    const config = getNeo4jAuth();
    const connection = new Neo4jConnectionModule(config);

    const queryParams: QueryParams = {
      query: `
      MATCH (a:Person)-[:ACTED_IN]->(m:Movie)
      WHERE a.name = "UNKNOWN ACTOR"
      RETURN m
    `,
      params: {},
    };

    const queryCallback: QueryCallback<any> = {
      onSuccess: (result: NeodashRecord[]) => {
        expect(result).toEqual([]);
      },
      onFail: (error) => {
        console.error('Query failed:', error);
        throw error;
      },
      setFields: (fields) => {
        expect(fields).toEqual([]);
      },
    };

    await connection.runQuery(queryParams, queryCallback, {
      ...DEFAULT_CONNECTION_CONFIG,
      parseToNeodashRecord: true,
      useNodePropsAsFields: true,
    });
  });
});
