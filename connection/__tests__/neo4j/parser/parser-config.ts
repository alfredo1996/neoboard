import { getNeo4jAuth } from '../../utils/setup';
import { Neo4jConnectionModule } from '../../../src/neo4j/Neo4jConnectionModule';
import { DEFAULT_CONNECTION_CONFIG, QueryCallback, QueryParams } from '../../../src/generalized/interfaces';
import { NeodashRecord } from '../../../src/generalized/NeodashRecord';

describe('Neo4jRecordParser - config parseToNeodashRecord', () => {
  test('should return parsed NeodashRecord when parseToNeodashRecord is true', async () => {
    const config = getNeo4jAuth();

    const connection = new Neo4jConnectionModule(config);

    const queryParams: QueryParams = {
      query: 'RETURN 42 AS number',
      params: {},
    };

    const queryCallback: QueryCallback<any> = {
      onSuccess: (result: NeodashRecord[]) => {
        expect(result[0]['number']).toBe(42);
        expect(result[0] instanceof NeodashRecord).toBe(true);
      },
      onFail: (error) => {
        console.error('Error during query execution:', error);
        throw error;
      },
    };

    await connection.runQuery(queryParams, queryCallback, { ...DEFAULT_CONNECTION_CONFIG, parseToNeodashRecord: true });
  });

  test('should return raw result when parseToNeodashRecord is false', async () => {
    const config = getNeo4jAuth();

    const connection = new Neo4jConnectionModule(config);

    const queryParams: QueryParams = {
      query: 'RETURN 42 AS number',
      params: {},
    };

    const queryCallback: QueryCallback<any> = {
      onSuccess: (result: NeodashRecord[]) => {
        expect(result[0] instanceof NeodashRecord).toBe(false);
      },
      onFail: (error) => {
        console.error('Error during query execution:', error);
        throw error;
      },
    };

    await connection.runQuery(queryParams, queryCallback, {
      ...DEFAULT_CONNECTION_CONFIG,
      parseToNeodashRecord: false,
    });
  });
});
