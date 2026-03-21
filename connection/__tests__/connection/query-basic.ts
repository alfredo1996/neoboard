import { getNeo4jAuth } from '../utils/setup';
import { Neo4jConnectionModule } from '../../src/neo4j/Neo4jConnectionModule';
import { QueryCallback, QueryParams } from '../../src/generalized/interfaces';
import { NEO4J_TEST_CONNECTION_CONFIG } from '../utils/setup';
import { Neo4jError } from 'neo4j-driver-core';

describe('Query to Neo4j', () => {
  test('run MATCH (n) RETURN n LIMIT 1 and get Data', async () => {
    const config = getNeo4jAuth();
    const connection = new Neo4jConnectionModule(config);

    const queryParams: QueryParams = {
      query: 'MATCH (n) RETURN n LIMIT 1',
      params: {},
    };

    const queryCallback: QueryCallback<any> = {
      onSuccess: (res) => {
        expect(res.length).toBeGreaterThan(0);
      },
      onFail: (err) => {
        console.error('Error executing query:', err);
      },
    };

    await connection.runQuery(queryParams, queryCallback, NEO4J_TEST_CONNECTION_CONFIG);
  });

  test('Run MATCH (p:Person) RETURN p LIMIT 10 and get data', async () => {
    const config = getNeo4jAuth();
    const connection = new Neo4jConnectionModule(config);

    const queryParams: QueryParams = {
      query: 'MATCH (p:Person) RETURN p LIMIT 10',
      params: {},
    };

    const queryCallback: QueryCallback<any> = {
      onSuccess: (res) => {
        expect(res.length).toBeGreaterThan(0);
      },
      onFail: (err) => {
        console.error('Error executing query:', err);
      },
    };

    await connection.runQuery(queryParams, queryCallback, NEO4J_TEST_CONNECTION_CONFIG);
  });

  test('Triggering error by forcing query timeout', async () => {
    const config = getNeo4jAuth();
    const connection = new Neo4jConnectionModule(config);

    const queryParams: QueryParams = {
      query: 'WITH range(1, toInteger(2^48)) AS x UNWIND x as y RETURN y ',
      params: {},
    };

    const queryCallback: QueryCallback<any> = {
      onSuccess: () => {
        throw Error('SHOULD FAIL');
      },
      onFail: (err) => {
        expect(err).toBeInstanceOf(Neo4jError);
        expect(err.message).toMatch(/^The transaction has been terminated/);
      },
    };
    const connectionConfig = { ...NEO4J_TEST_CONNECTION_CONFIG, connectionTimeout: 100 };
    await connection.runQuery(queryParams, queryCallback, connectionConfig);
  });

  test('Triggering error by forcing query timeout on Write', async () => {
    const config = getNeo4jAuth();
    const connection = new Neo4jConnectionModule(config);

    const queryParams: QueryParams = {
      query: 'WITH range(1, toInteger(2^48)) AS x UNWIND x as y RETURN y ',
      params: {},
    };

    const queryCallback: QueryCallback<any> = {
      onSuccess: () => {
        throw Error('SHOULD FAIL');
      },
      onFail: (err) => {
        expect(err).toBeInstanceOf(Neo4jError);
        expect(err.message).toMatch(/^The transaction has been terminated/);
      },
    };
    const connectionConfig = { ...NEO4J_TEST_CONNECTION_CONFIG, connectionTimeout: 100, accessMode: 'WRITE' };
    await connection.runQuery(queryParams, queryCallback, connectionConfig);
  });
});
