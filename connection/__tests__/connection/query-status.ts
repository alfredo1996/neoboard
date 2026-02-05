import { getNeo4jAuth } from '../utils/setup';
import { Neo4jConnectionModule } from '../../src/neo4j/Neo4jConnectionModule';
import { DEFAULT_CONNECTION_CONFIG, QueryCallback, QueryParams, QueryStatus } from '../../src/generalized/interfaces';

describe('Query to Neo4j', () => {
  test('run MATCH (n) RETURN n LIMIT 1 and receive COMPLETE status', async () => {
    const config = getNeo4jAuth();
    const connection = new Neo4jConnectionModule(config);

    const queryParams: QueryParams = {
      query: 'MATCH (n) RETURN n LIMIT 1',
      params: {},
    };

    let receivedStatus: QueryStatus | null = null;

    const queryCallback: QueryCallback<any> = {
      onSuccess: (res) => {
        expect(res.length).toBeGreaterThan(0);
      },
      onFail: (err) => {
        console.error('Error executing query:', err);
        fail('Query failed unexpectedly');
      },
      setStatus: (status) => {
        receivedStatus = status;
      },
    };

    await connection.runQuery(queryParams, queryCallback, DEFAULT_CONNECTION_CONFIG);

    expect(receivedStatus).toBe(QueryStatus.COMPLETE);
  });

  test('should return COMPLETE_TRUNCATED when result exceeds rowLimit', async () => {
    const config = getNeo4jAuth();
    const connection = new Neo4jConnectionModule(config);

    const queryParams: QueryParams = {
      query: 'MATCH (n) RETURN n LIMIT 100', // Request more data than allowed
      params: {},
    };

    let receivedStatus: QueryStatus | null = null;
    let receivedRecords: any[] | null = null;

    const queryCallback: QueryCallback<any> = {
      onSuccess: (res) => {
        receivedRecords = res;
      },
      onFail: (err) => {
        console.error('Query failed:', err);
        fail('Query should not fail');
      },
      setStatus: (status) => {
        receivedStatus = status;
      },
    };

    // Use a custom config with a low rowLimit to trigger truncation
    const configWithRowLimit = {
      ...DEFAULT_CONNECTION_CONFIG,
      rowLimit: 5,
    };

    await connection.runQuery(queryParams, queryCallback, configWithRowLimit);

    // Validate that the status reflects truncation
    expect(receivedStatus).toBe(QueryStatus.COMPLETE_TRUNCATED);

    // Ensure the returned results do not exceed the configured limit
    expect(receivedRecords).not.toBeNull();
    expect(receivedRecords!.length).toBeLessThanOrEqual(5);
  });

  test('should set RUNNING before COMPLETE status', async () => {
    const config = getNeo4jAuth();
    const connection = new Neo4jConnectionModule(config);

    const queryParams: QueryParams = {
      query: 'MATCH (n) RETURN n LIMIT 1',
      params: {},
    };

    // Track the sequence of status changes
    const statusSequence: QueryStatus[] = [];

    const queryCallback: QueryCallback<any> = {
      onSuccess: (res) => {
        expect(res.length).toBeGreaterThan(0);
      },
      onFail: (err) => {
        console.error('Unexpected error:', err);
        fail('Query should not fail');
      },
      setStatus: (status) => {
        statusSequence.push(status);
      },
    };

    await connection.runQuery(queryParams, queryCallback, DEFAULT_CONNECTION_CONFIG);

    // Check that RUNNING was set before COMPLETE
    const runningIndex = statusSequence.indexOf(QueryStatus.RUNNING);
    const completeIndex = statusSequence.indexOf(QueryStatus.COMPLETE);

    expect(runningIndex).toBeGreaterThan(-1);
    expect(completeIndex).toBeGreaterThan(-1);
    expect(runningIndex).toBeLessThan(completeIndex);
  });

  test('should set NO_DATA when query returns no records', async () => {
    const config = getNeo4jAuth();
    const connection = new Neo4jConnectionModule(config);

    const queryParams: QueryParams = {
      query: 'MATCH (n) WHERE false RETURN n', // Always returns 0 results
      params: {},
    };

    let receivedStatus: QueryStatus | null = null;

    const queryCallback: QueryCallback<any> = {
      onSuccess: (res) => {
        expect(res.length).toBe(0);
      },
      onFail: () => {
        fail('Query should not fail');
      },
      setStatus: (status) => {
        receivedStatus = status;
      },
    };

    await connection.runQuery(queryParams, queryCallback, DEFAULT_CONNECTION_CONFIG);

    expect(receivedStatus).toBe(QueryStatus.NO_DATA);
  });

  test('should set ERROR when query is invalid', async () => {
    const config = getNeo4jAuth();
    const connection = new Neo4jConnectionModule(config);

    const queryParams: QueryParams = {
      query: 'RETURN', // Invalid Cypher query
      params: {},
    };

    let receivedStatus: QueryStatus | null = null;

    const queryCallback: QueryCallback<any> = {
      onSuccess: () => {
        fail('Query should not succeed');
      },
      onFail: (err) => {
        expect(err).toBeDefined();
      },
      setStatus: (status) => {
        receivedStatus = status;
      },
    };

    await connection.runQuery(queryParams, queryCallback, DEFAULT_CONNECTION_CONFIG);

    expect(receivedStatus).toBe(QueryStatus.ERROR);
  });

  test('should set TIMED_OUT when query exceeds timeout', async () => {
    const config = getNeo4jAuth();
    const connection = new Neo4jConnectionModule(config);

    const queryParams: QueryParams = {
      query: 'WITH range(1, toInteger(2^48)) AS x UNWIND x as y RETURN y', // Will explode result size
      params: {},
    };

    let receivedStatus: QueryStatus | null = null;

    const queryCallback: QueryCallback<any> = {
      onSuccess: () => {
        fail('Query should have timed out');
      },
      onFail: (err) => {
        expect(err).toBeDefined();
      },
      setStatus: (status) => {
        receivedStatus = status;
      },
    };

    // Set a very low timeout (e.g., 100 ms)
    const shortTimeoutConfig = {
      ...DEFAULT_CONNECTION_CONFIG,
      connectionTimeout: 100, // Timeout in milliseconds
    };

    await connection.runQuery(queryParams, queryCallback, shortTimeoutConfig);

    expect(receivedStatus).toBe(QueryStatus.TIMED_OUT);
  });

  test('should set TIMED_OUT when write query exceeds timeout', async () => {
    const config = getNeo4jAuth();
    const connection = new Neo4jConnectionModule(config);

    const queryParams: QueryParams = {
      query: 'UNWIND range(1, toInteger(2^48)) AS id CREATE (:TimeoutTest {id: id})',
      params: {},
    };

    let receivedStatus: QueryStatus | null = null;

    const queryCallback: QueryCallback<any> = {
      onSuccess: () => {
        throw new Error('Query should have timed out');
      },
      onFail: (err) => {
        expect(err).toBeDefined();
      },
      setStatus: (status) => {
        receivedStatus = status;
      },
    };

    const shortTimeoutConfig = {
      ...DEFAULT_CONNECTION_CONFIG,
      accessMode: 'WRITE',
      connectionTimeout: 100, // ms
    };

    await connection.runQuery(queryParams, queryCallback, shortTimeoutConfig);

    expect(receivedStatus).toBe(QueryStatus.TIMED_OUT);
  });

  test('run MATCH (n:Test {name:“foobar”}) RETURN n and get NO_DATA', async () => {
    const config = getNeo4jAuth();
    const connection = new Neo4jConnectionModule(config);

    const queryParams: QueryParams = {
      query: 'MATCH (n:Test {name:"foobar"}) RETURN n',
      params: {},
    };
    let receivedStatus: QueryStatus | null = null;
    const queryCallback: QueryCallback<any> = {
      onSuccess: (res) => {
        expect(res.length).toBe(0);
        expect(receivedStatus).toBe(QueryStatus.NO_DATA);
      },
      onFail: (err) => {
        console.error('Error executing query:', err);
      },
      setStatus: (status) => {
        receivedStatus = status;
      },
    };

    await connection.runQuery(queryParams, queryCallback, DEFAULT_CONNECTION_CONFIG);
  });

  test('Trying to run the query with an empty string should set the status to NO_QUERY', async () => {
    const config = getNeo4jAuth();
    const connection = new Neo4jConnectionModule(config);

    const queryParams: QueryParams = {
      query: '',
      params: {},
    };

    const queryCallback: QueryCallback<any> = {
      onSuccess: (res) => {
        console.log(res);
      },
      onFail: (err) => {
        console.error('Error executing query:', err);
      },
      setStatus: (status) => {
        expect(status).toBe(QueryStatus.NO_QUERY);
      },
    };

    await connection.runQuery(queryParams, queryCallback, DEFAULT_CONNECTION_CONFIG);
  });

  test('Trying to run the query undefined/null should set the status to NO_QUERY', async () => {
    const config = getNeo4jAuth();
    const connection = new Neo4jConnectionModule(config);

    // Intentionally passing undefined to simulate no query
    const queryParams: QueryParams = {
      // @ts-ignore
      query: undefined,
      params: {},
    };

    const queryCallback: QueryCallback<any> = {
      onSuccess: (res) => {
        console.log(res);
      },
      onFail: (err) => {
        console.error('Error executing query:', err);
      },
      setStatus: (status) => {
        expect(status).toBe(QueryStatus.NO_QUERY);
      },
    };

    await connection.runQuery(queryParams, queryCallback, DEFAULT_CONNECTION_CONFIG);
  });
});
