import { getNeo4jAuth } from '../utils/setup';
import { Neo4jConnectionModule } from '../../src/neo4j/Neo4jConnectionModule';
import { QueryCallback, QueryParams, QueryStatus } from '../../src/generalized/interfaces';
import { NEO4J_TEST_CONNECTION_CONFIG } from '../utils/setup';

describe('Neo4j Transaction Rollback', () => {
  test('write transaction auto-rolls back on error — node is NOT persisted', async () => {
    const config = getNeo4jAuth();
    const connection = new Neo4jConnectionModule(config);

    const uniqueLabel = `RollbackTest_${Date.now()}`;

    // Attempt a CREATE that will fail mid-transaction due to a division-by-zero error.
    // The CREATE runs first, then the error occurs — if rollback works, the node won't persist.
    let failError: unknown = null;
    await connection.runQuery(
      {
        query: `CREATE (n:${uniqueLabel} {name: 'should_not_exist'}) WITH n RETURN 1/0`,
        params: {},
      },
      {
        onFail: (err) => { failError = err; },
        setStatus: () => {},
      },
      { ...NEO4J_TEST_CONNECTION_CONFIG, accessMode: 'WRITE' }
    );

    // The query should have failed
    expect(failError).toBeDefined();

    // Verify the node was NOT created (transaction should have rolled back)
    let result: any = null;
    await connection.runQuery(
      {
        query: `MATCH (n:${uniqueLabel}) RETURN n`,
        params: {},
      },
      {
        onSuccess: (r) => { result = r; },
        setStatus: () => {},
      },
      NEO4J_TEST_CONNECTION_CONFIG
    );

    expect(result).toHaveLength(0);
  });
});
