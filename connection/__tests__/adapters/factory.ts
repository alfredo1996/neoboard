import { createConnectionModule } from '../../src/adapters/factory';
import { ConnectionTypes } from '../../src/ConnectionModuleConfig';
import { Neo4jConnectionModule } from '../../src/neo4j/Neo4jConnectionModule';
import { PostgresConnectionModule } from '../../src/postgresql/PostgresConnectionModule';
import { AuthType } from '../../src/generalized/interfaces';

describe('Connection Module Factory', () => {
  const dummyAuthConfig = {
    username: 'test',
    password: 'test',
    authType: AuthType.NATIVE,
    uri: 'bolt://localhost:7687',
  };

  test('should create Neo4j connection module', () => {
    const module = createConnectionModule(ConnectionTypes.NEO4J, dummyAuthConfig);
    expect(module).toBeInstanceOf(Neo4jConnectionModule);
  });

  test('should create PostgreSQL connection module', () => {
    const module = createConnectionModule(ConnectionTypes.POSTGRESQL, dummyAuthConfig);
    expect(module).toBeInstanceOf(PostgresConnectionModule);
  });

  test('should throw for unsupported connection type', () => {
    expect(() => {
      createConnectionModule(999 as any, dummyAuthConfig);
    }).toThrow('Unsupported connection type');
  });
});
