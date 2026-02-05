import {
  createConnectionModule,
  getConnectionTypeName,
  getSupportedConnectionTypes,
} from '../../src/adapters/factory';
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

  test('should return correct connection type names', () => {
    expect(getConnectionTypeName(ConnectionTypes.NEO4J)).toBe('Neo4j');
    expect(getConnectionTypeName(ConnectionTypes.POSTGRESQL)).toBe('PostgreSQL');
  });

  test('should return unknown for invalid type', () => {
    expect(getConnectionTypeName(999 as any)).toBe('Unknown');
  });

  test('should return all supported connection types', () => {
    const types = getSupportedConnectionTypes();
    expect(types).toContain(ConnectionTypes.NEO4J);
    expect(types).toContain(ConnectionTypes.POSTGRESQL);
    expect(types).toHaveLength(2);
  });
});
