import { ConnectionTypes } from '../src/ConnectionModuleConfig';
import { AuthType } from '../src/generalized/interfaces';
import type { AdvancedConnectionOptions } from '../src/generalized/interfaces';

// ---------------------------------------------------------------------------
// Mocks — capture constructor args for neo4j.driver() and pg.Pool
// ---------------------------------------------------------------------------

const mockNeo4jDriverFn = jest.fn().mockReturnValue({
  verifyAuthentication: jest.fn().mockResolvedValue(true),
  close: jest.fn().mockResolvedValue(undefined),
  session: jest.fn(),
});

jest.mock('neo4j-driver', () => ({
  __esModule: true,
  default: {
    driver: mockNeo4jDriverFn,
    auth: {
      basic: jest.fn((u: string, p: string) => ({ principal: u, credentials: p })),
    },
  },
}));

// Track Pool constructor calls for assertions
const poolConstructorCalls: Record<string, unknown>[] = [];
const mockPoolInstance = {
  connect: jest.fn(),
  end: jest.fn().mockResolvedValue(undefined),
  on: jest.fn(),
  removeAllListeners: jest.fn(),
};

jest.mock('pg', () => ({
  Pool: jest.fn().mockImplementation((config: Record<string, unknown>) => {
    poolConstructorCalls.push(config);
    return mockPoolInstance;
  }),
}));

// ---------------------------------------------------------------------------
// Shared fixtures
// ---------------------------------------------------------------------------

const neo4jAuth = {
  username: 'neo4j',
  password: 'test',
  authType: AuthType.NATIVE,
  uri: 'bolt://localhost:7687',
};

const pgAuth = {
  username: 'postgres',
  password: 'test',
  authType: AuthType.NATIVE,
  uri: 'postgresql://localhost:5432/testdb',
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('AdvancedConnectionOptions interface', () => {
  it('allows partial options (all fields optional)', () => {
    const opts: AdvancedConnectionOptions = {};
    expect(opts).toEqual({});
  });

  it('accepts all Neo4j-specific fields', () => {
    const opts: AdvancedConnectionOptions = {
      neo4jConnectionTimeout: 5000,
      neo4jQueryTimeout: 3000,
      neo4jMaxPoolSize: 50,
      neo4jAcquisitionTimeout: 10000,
    };
    expect(opts.neo4jConnectionTimeout).toBe(5000);
  });

  it('accepts all PostgreSQL-specific fields', () => {
    const opts: AdvancedConnectionOptions = {
      pgConnectionTimeoutMillis: 8000,
      pgIdleTimeoutMillis: 15000,
      pgMaxPoolSize: 20,
      pgStatementTimeout: 60000,
      pgSslRejectUnauthorized: false,
    };
    expect(opts.pgMaxPoolSize).toBe(20);
  });
});

describe('Neo4jAuthenticationModule with advanced options', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('passes default connectionTimeout when no advanced options provided', () => {
    const { Neo4jAuthenticationModule } = require('../src/neo4j/Neo4jAuthenticationModule');
    new Neo4jAuthenticationModule(neo4jAuth);

    expect(mockNeo4jDriverFn).toHaveBeenCalledWith(
      neo4jAuth.uri,
      expect.anything(),
      expect.objectContaining({ connectionTimeout: 30000 })
    );
  });

  it('passes custom connectionTimeout from advanced options', () => {
    const { Neo4jAuthenticationModule } = require('../src/neo4j/Neo4jAuthenticationModule');
    const advancedOptions: AdvancedConnectionOptions = {
      neo4jConnectionTimeout: 5000,
      neo4jMaxPoolSize: 50,
      neo4jAcquisitionTimeout: 10000,
    };
    new Neo4jAuthenticationModule(neo4jAuth, advancedOptions);

    expect(mockNeo4jDriverFn).toHaveBeenCalledWith(
      neo4jAuth.uri,
      expect.anything(),
      expect.objectContaining({
        connectionTimeout: 5000,
        maxConnectionPoolSize: 50,
        connectionAcquisitionTimeout: 10000,
      })
    );
  });
});

describe('PostgresAuthenticationModule with advanced options', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    poolConstructorCalls.length = 0;
  });

  it('uses default pool config when no advanced options provided', () => {
    const { PostgresAuthenticationModule } = require('../src/postgresql/PostgresAuthenticationModule');
    new PostgresAuthenticationModule(pgAuth);

    expect(poolConstructorCalls).toHaveLength(1);
    expect(poolConstructorCalls[0]).toEqual(
      expect.objectContaining({
        connectionTimeoutMillis: 10000,
        idleTimeoutMillis: 10000,
        max: 10,
      })
    );
  });

  it('passes custom pool config from advanced options', () => {
    const { PostgresAuthenticationModule } = require('../src/postgresql/PostgresAuthenticationModule');
    const advancedOptions: AdvancedConnectionOptions = {
      pgConnectionTimeoutMillis: 5000,
      pgIdleTimeoutMillis: 20000,
      pgMaxPoolSize: 25,
    };
    new PostgresAuthenticationModule(pgAuth, advancedOptions);

    expect(poolConstructorCalls).toHaveLength(1);
    expect(poolConstructorCalls[0]).toEqual(
      expect.objectContaining({
        connectionTimeoutMillis: 5000,
        idleTimeoutMillis: 20000,
        max: 25,
      })
    );
  });

  it('passes ssl config when pgSslRejectUnauthorized is set', () => {
    const { PostgresAuthenticationModule } = require('../src/postgresql/PostgresAuthenticationModule');
    const advancedOptions: AdvancedConnectionOptions = {
      pgSslRejectUnauthorized: false,
    };
    new PostgresAuthenticationModule(pgAuth, advancedOptions);

    expect(poolConstructorCalls).toHaveLength(1);
    expect(poolConstructorCalls[0]).toEqual(
      expect.objectContaining({
        ssl: { rejectUnauthorized: false },
      })
    );
  });

  it('does not include ssl when pgSslRejectUnauthorized is undefined', () => {
    const { PostgresAuthenticationModule } = require('../src/postgresql/PostgresAuthenticationModule');
    new PostgresAuthenticationModule(pgAuth);

    expect(poolConstructorCalls).toHaveLength(1);
    expect(poolConstructorCalls[0].ssl).toBeUndefined();
  });
});

describe('createConnectionModule with advanced options', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    poolConstructorCalls.length = 0;
  });

  it('forwards advanced options to Neo4j module', () => {
    const { createConnectionModule } = require('../src/adapters/factory');
    const advancedOptions: AdvancedConnectionOptions = {
      neo4jConnectionTimeout: 15000,
    };
    const module = createConnectionModule(ConnectionTypes.NEO4J, neo4jAuth, advancedOptions);
    expect(module).toBeDefined();

    expect(mockNeo4jDriverFn).toHaveBeenCalledWith(
      neo4jAuth.uri,
      expect.anything(),
      expect.objectContaining({ connectionTimeout: 15000 })
    );
  });

  it('forwards advanced options to PostgreSQL module', () => {
    const { createConnectionModule } = require('../src/adapters/factory');
    const advancedOptions: AdvancedConnectionOptions = {
      pgMaxPoolSize: 30,
    };
    const module = createConnectionModule(ConnectionTypes.POSTGRESQL, pgAuth, advancedOptions);
    expect(module).toBeDefined();

    expect(poolConstructorCalls).toHaveLength(1);
    expect(poolConstructorCalls[0]).toEqual(
      expect.objectContaining({ max: 30 })
    );
  });

  it('works without advanced options (backward compatible)', () => {
    const { createConnectionModule } = require('../src/adapters/factory');
    const module = createConnectionModule(ConnectionTypes.NEO4J, neo4jAuth);
    expect(module).toBeDefined();
  });
});
