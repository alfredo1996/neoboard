import { createConnectionModule } from '../../src/adapters/factory';
import { ConnectionTypes } from '../../src/ConnectionModuleConfig';
import { Neo4jConnectionModule } from '../../src/neo4j/Neo4jConnectionModule';
import { PostgresConnectionModule } from '../../src/postgresql/PostgresConnectionModule';
import { AuthType } from '../../src/generalized/interfaces';

describe('Connection Module Factory', () => {
  const neo4jAuthConfig = {
    username: 'test',
    password: 'test',
    authType: AuthType.NATIVE,
    uri: 'bolt://localhost:7687',
  };

  const pgAuthConfig = {
    username: 'test',
    password: 'test',
    authType: AuthType.NATIVE,
    uri: 'postgresql://localhost:5432/testdb',
  };

  test('should create Neo4j connection module', () => {
    const module = createConnectionModule(ConnectionTypes.NEO4J, neo4jAuthConfig);
    expect(module).toBeInstanceOf(Neo4jConnectionModule);
  });

  test('should create PostgreSQL connection module', () => {
    const module = createConnectionModule(ConnectionTypes.POSTGRESQL, pgAuthConfig);
    expect(module).toBeInstanceOf(PostgresConnectionModule);
  });

  test('should throw for unsupported connection type', () => {
    expect(() => {
      // Force an unsupported type to test the error path
      createConnectionModule(999 as unknown as ConnectionTypes, neo4jAuthConfig);
    }).toThrow('Unsupported connection type');
  });
});
