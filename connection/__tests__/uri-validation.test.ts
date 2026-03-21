import { AuthType } from '../src/generalized/interfaces';

// ---------------------------------------------------------------------------
// Mocks — prevent actual driver connections
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

const mockPoolInstance = {
  connect: jest.fn(),
  end: jest.fn().mockResolvedValue(undefined),
  on: jest.fn(),
  removeAllListeners: jest.fn(),
};

jest.mock('pg', () => ({
  Pool: jest.fn().mockImplementation(() => mockPoolInstance),
}));

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('URI Validation', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Neo4j URI validation', () => {
    it('accepts bolt:// protocol', () => {
      const { Neo4jAuthenticationModule } = require('../src/neo4j/Neo4jAuthenticationModule');
      expect(() => {
        new Neo4jAuthenticationModule({
          username: 'neo4j', password: 'test', authType: AuthType.NATIVE,
          uri: 'bolt://localhost:7687',
        });
      }).not.toThrow();
    });

    it('accepts neo4j:// protocol', () => {
      const { Neo4jAuthenticationModule } = require('../src/neo4j/Neo4jAuthenticationModule');
      expect(() => {
        new Neo4jAuthenticationModule({
          username: 'neo4j', password: 'test', authType: AuthType.NATIVE,
          uri: 'neo4j://localhost:7687',
        });
      }).not.toThrow();
    });

    it('accepts bolt+s:// protocol', () => {
      const { Neo4jAuthenticationModule } = require('../src/neo4j/Neo4jAuthenticationModule');
      expect(() => {
        new Neo4jAuthenticationModule({
          username: 'neo4j', password: 'test', authType: AuthType.NATIVE,
          uri: 'bolt+s://localhost:7687',
        });
      }).not.toThrow();
    });

    it('accepts bolt+ssc:// protocol', () => {
      const { Neo4jAuthenticationModule } = require('../src/neo4j/Neo4jAuthenticationModule');
      expect(() => {
        new Neo4jAuthenticationModule({
          username: 'neo4j', password: 'test', authType: AuthType.NATIVE,
          uri: 'bolt+ssc://localhost:7687',
        });
      }).not.toThrow();
    });

    it('accepts neo4j+s:// protocol', () => {
      const { Neo4jAuthenticationModule } = require('../src/neo4j/Neo4jAuthenticationModule');
      expect(() => {
        new Neo4jAuthenticationModule({
          username: 'neo4j', password: 'test', authType: AuthType.NATIVE,
          uri: 'neo4j+s://localhost:7687',
        });
      }).not.toThrow();
    });

    it('accepts neo4j+ssc:// protocol', () => {
      const { Neo4jAuthenticationModule } = require('../src/neo4j/Neo4jAuthenticationModule');
      expect(() => {
        new Neo4jAuthenticationModule({
          username: 'neo4j', password: 'test', authType: AuthType.NATIVE,
          uri: 'neo4j+ssc://localhost:7687',
        });
      }).not.toThrow();
    });

    it('rejects http:// protocol', () => {
      const { Neo4jAuthenticationModule } = require('../src/neo4j/Neo4jAuthenticationModule');
      expect(() => {
        new Neo4jAuthenticationModule({
          username: 'neo4j', password: 'test', authType: AuthType.NATIVE,
          uri: 'http://localhost:7687',
        });
      }).toThrow('Invalid URI protocol');
    });

    it('rejects postgresql:// protocol', () => {
      const { Neo4jAuthenticationModule } = require('../src/neo4j/Neo4jAuthenticationModule');
      expect(() => {
        new Neo4jAuthenticationModule({
          username: 'neo4j', password: 'test', authType: AuthType.NATIVE,
          uri: 'postgresql://localhost:5432',
        });
      }).toThrow('Invalid URI protocol');
    });

    it('rejects malformed URI', () => {
      const { Neo4jAuthenticationModule } = require('../src/neo4j/Neo4jAuthenticationModule');
      expect(() => {
        new Neo4jAuthenticationModule({
          username: 'neo4j', password: 'test', authType: AuthType.NATIVE,
          uri: 'not-a-uri',
        });
      }).toThrow('Invalid URI format');
    });

    it('rejects SSO auth type with clear error', () => {
      const { Neo4jAuthenticationModule } = require('../src/neo4j/Neo4jAuthenticationModule');
      expect(() => {
        new Neo4jAuthenticationModule({
          username: 'neo4j', password: 'test', authType: AuthType.SINGLE_SIGN_ON,
          uri: 'bolt://localhost:7687',
        });
      }).toThrow('SSO authentication is not yet supported');
    });
  });

  describe('PostgreSQL URI validation', () => {
    it('accepts postgresql:// protocol', () => {
      const { PostgresAuthenticationModule } = require('../src/postgresql/PostgresAuthenticationModule');
      expect(() => {
        new PostgresAuthenticationModule({
          username: 'postgres', password: 'test', authType: AuthType.NATIVE,
          uri: 'postgresql://localhost:5432/testdb',
        });
      }).not.toThrow();
    });

    it('accepts postgres:// protocol', () => {
      const { PostgresAuthenticationModule } = require('../src/postgresql/PostgresAuthenticationModule');
      expect(() => {
        new PostgresAuthenticationModule({
          username: 'postgres', password: 'test', authType: AuthType.NATIVE,
          uri: 'postgres://localhost:5432/testdb',
        });
      }).not.toThrow();
    });

    it('rejects bolt:// protocol', () => {
      const { PostgresAuthenticationModule } = require('../src/postgresql/PostgresAuthenticationModule');
      expect(() => {
        new PostgresAuthenticationModule({
          username: 'postgres', password: 'test', authType: AuthType.NATIVE,
          uri: 'bolt://localhost:7687',
        });
      }).toThrow('Invalid URI protocol');
    });

    it('rejects http:// protocol', () => {
      const { PostgresAuthenticationModule } = require('../src/postgresql/PostgresAuthenticationModule');
      expect(() => {
        new PostgresAuthenticationModule({
          username: 'postgres', password: 'test', authType: AuthType.NATIVE,
          uri: 'http://localhost:5432',
        });
      }).toThrow('Invalid URI protocol');
    });

    it('rejects malformed URI', () => {
      const { PostgresAuthenticationModule } = require('../src/postgresql/PostgresAuthenticationModule');
      expect(() => {
        new PostgresAuthenticationModule({
          username: 'postgres', password: 'test', authType: AuthType.NATIVE,
          uri: 'not-a-valid-uri',
        });
      }).toThrow('Invalid URI format');
    });
  });

  describe('Base _checkConfigurationConsistency', () => {
    it('rejects empty URI string', () => {
      const { Neo4jAuthenticationModule } = require('../src/neo4j/Neo4jAuthenticationModule');
      expect(() => {
        new Neo4jAuthenticationModule({
          username: 'neo4j', password: 'test', authType: AuthType.NATIVE,
          uri: '',
        });
      }).toThrow('URI is required');
    });

    it('rejects whitespace-only URI string', () => {
      const { Neo4jAuthenticationModule } = require('../src/neo4j/Neo4jAuthenticationModule');
      expect(() => {
        new Neo4jAuthenticationModule({
          username: 'neo4j', password: 'test', authType: AuthType.NATIVE,
          uri: '   ',
        });
      }).toThrow('URI is required');
    });
  });
});
