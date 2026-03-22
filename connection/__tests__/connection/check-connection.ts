import { NEO4J_TEST_CONNECTION_CONFIG } from '../utils/setup';
import { getNeo4jAuth } from '../utils/setup';
import { Neo4jConnectionModule } from '../../src/neo4j/Neo4jConnectionModule';

describe('Neo4jAuthenticationModule with native authentication', () => {
  test('should successfully verify connection using checkConnection()', async () => {
    const config = getNeo4jAuth();
    const connection = new Neo4jConnectionModule(config);
    const isAuthenticated = await connection.checkConnection(NEO4J_TEST_CONNECTION_CONFIG);
    expect(isAuthenticated).toBe(true);
  });

  test('should successfully verify connection using checkConnection() with no db', async () => {
    const config = getNeo4jAuth();
    const connection = new Neo4jConnectionModule(config);
    const isAuthenticated = await connection.checkConnection({ ...NEO4J_TEST_CONNECTION_CONFIG, database: '' });
    expect(isAuthenticated).toBe(true);
  });

  test('should successfully verify connection using checkConnection() wrong database', async () => {
    const config = getNeo4jAuth();
    const connection = new Neo4jConnectionModule(config);
    await expect(connection.checkConnection({ ...NEO4J_TEST_CONNECTION_CONFIG, database: 'neo3j' })).rejects.toThrow();
  });
});
