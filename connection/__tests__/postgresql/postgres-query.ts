import { PostgresConnectionModule } from '../../src/postgresql/PostgresConnectionModule';
import { DEFAULT_CONNECTION_CONFIG, QueryStatus, AuthType, ConnectionTypes } from '../../src/generalized/interfaces';
import { PostgreSqlContainer } from '@testcontainers/postgresql';

describe('PostgreSQL Query Execution', () => {
  let container: PostgreSqlContainer;
  let connectionModule: PostgresConnectionModule;

  beforeAll(async () => {
    container = await new PostgreSqlContainer().start();

    connectionModule = new PostgresConnectionModule({
      username: container.getUsername(),
      password: container.getPassword(),
      authType: AuthType.NATIVE,
      uri: `postgresql://${container.getHost()}:${container.getPort()}/${container.getDatabase()}`,
    });

    // Authenticate before running tests
    const authenticated = await connectionModule.authModule.authenticate();
    expect(authenticated).toBe(true);

    // Create a test table
    const createTableQuery = `
      CREATE TABLE users (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        email VARCHAR(255) UNIQUE,
        age INT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `;

    const client = connectionModule.getPool()!.connect();
    try {
      await (await client).query(createTableQuery);

      // Insert test data
      await (await client).query(
        `INSERT INTO users (name, email, age) VALUES ($1, $2, $3)`,
        ['Alice', 'alice@example.com', 30]
      );
      await (await client).query(
        `INSERT INTO users (name, email, age) VALUES ($1, $2, $3)`,
        ['Bob', 'bob@example.com', 25]
      );
    } finally {
      (await client).release();
    }
  }, 60000);

  afterAll(async () => {
    // Close module first before stopping container
    if (connectionModule) {
      try {
        await connectionModule.close();
      } catch (error) {
        // Suppress shutdown errors
      }
    }

    // Stop container
    try {
      await container.stop();
    } catch (error) {
      // Suppress container shutdown errors
    }
  });

  test('should execute SELECT query', async () => {
    let result: any = null;
    let status: QueryStatus | null = null;
    let error: any = null;

    const config = {
      ...DEFAULT_CONNECTION_CONFIG,
      connectionType: ConnectionTypes.POSTGRESQL,
      parseToNeodashRecord: true,
    };

    await connectionModule.runQuery(
      { query: 'SELECT * FROM users ORDER BY id ASC' },
      {
        onSuccess: r => (result = r),
        onFail: e => (error = e),
        setStatus: s => (status = s),
      },
      config
    );

    expect(error).toBeNull();
    expect(status).toBe(QueryStatus.COMPLETE);
    expect(result).toBeDefined();
    // onSuccess receives a flat NeodashRecord[] array directly
    expect(result).toHaveLength(2);
    expect(result[0].name).toBe('Alice');
  });

  test('should execute query with parameters', async () => {
    let result: any = null;
    let status: QueryStatus | null = null;

    const config = {
      ...DEFAULT_CONNECTION_CONFIG,
      connectionType: ConnectionTypes.POSTGRESQL,
      parseToNeodashRecord: true,
    };

    await connectionModule.runQuery(
      {
        query: 'SELECT * FROM users WHERE name = $1',
        params: { '0': 'Alice' },  // Positional parameter at index 0
      },
      {
        onSuccess: r => (result = r),
        setStatus: s => (status = s),
      },
      config
    );

    expect(status).toBe(QueryStatus.COMPLETE);
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe('Alice');
  });

  test('should return NO_DATA for empty result set', async () => {
    let status: QueryStatus | null = null;

    const config = {
      ...DEFAULT_CONNECTION_CONFIG,
      connectionType: ConnectionTypes.POSTGRESQL,
    };

    await connectionModule.runQuery(
      { query: 'SELECT * FROM users WHERE id = 9999' },
      {
        setStatus: s => (status = s),
      },
      config
    );

    expect(status).toBe(QueryStatus.NO_DATA);
  });

  test('should return NO_QUERY for empty query', async () => {
    let status: QueryStatus | null = null;

    const config = {
      ...DEFAULT_CONNECTION_CONFIG,
      connectionType: ConnectionTypes.POSTGRESQL,
    };

    await connectionModule.runQuery(
      { query: '' },
      {
        setStatus: s => (status = s),
      },
      config
    );

    expect(status).toBe(QueryStatus.NO_QUERY);
  });

  test('should handle query errors', async () => {
    let status: QueryStatus | null = null;
    let error: any = null;

    const config = {
      ...DEFAULT_CONNECTION_CONFIG,
      connectionType: ConnectionTypes.POSTGRESQL,
    };

    await connectionModule.runQuery(
      { query: 'SELECT * FROM nonexistent_table' },
      {
        onFail: e => (error = e),
        setStatus: s => (status = s),
      },
      config
    );

    expect(status).toBe(QueryStatus.ERROR);
    expect(error).toBeDefined();
  });

  test('should handle row limiting', async () => {
    let result: any = null;

    const config = {
      ...DEFAULT_CONNECTION_CONFIG,
      connectionType: ConnectionTypes.POSTGRESQL,
      rowLimit: 1,
      parseToNeodashRecord: true,
    };

    await connectionModule.runQuery(
      { query: 'SELECT * FROM users' },
      {
        onSuccess: r => (result = r),
      },
      config
    );

    // Even though we have 2 rows, with rowLimit=1, should get only 1
    expect(result).toHaveLength(1);
  });

  test('should check connection health', async () => {
    const config = {
      ...DEFAULT_CONNECTION_CONFIG,
      connectionType: ConnectionTypes.POSTGRESQL,
    };

    const isHealthy = await connectionModule.checkConnection(config);
    expect(isHealthy).toBe(true);
  });

  test('should return flat records and COMPLETE status', async () => {
    let result: any = null;
    let status: QueryStatus | null = null;

    const config = {
      ...DEFAULT_CONNECTION_CONFIG,
      connectionType: ConnectionTypes.POSTGRESQL,
      parseToNeodashRecord: true,
    };

    await connectionModule.runQuery(
      { query: 'SELECT * FROM users' },
      {
        onSuccess: r => (result = r),
        setStatus: s => (status = s),
      },
      config
    );

    // onSuccess receives a flat NeodashRecord[] — no summary wrapper
    expect(result).toBeDefined();
    expect(Array.isArray(result)).toBe(true);
    expect(status).toBe(QueryStatus.COMPLETE);
  });

  test('should call setSchema callback with schema information', async () => {
    let schema: any = null;
    let result: any = null;

    const config = {
      ...DEFAULT_CONNECTION_CONFIG,
      connectionType: ConnectionTypes.POSTGRESQL,
      parseToNeodashRecord: true,
    };

    await connectionModule.runQuery(
      { query: 'SELECT * FROM users' },
      {
        onSuccess: r => (result = r),
        setSchema: s => (schema = s),
      },
      config
    );

    expect(schema).toBeDefined();
    expect(Array.isArray(schema)).toBe(true);
    expect(schema.length).toBeGreaterThan(0);
  });

  test('should call setFields callback with field information', async () => {
    let fields: any = null;
    let result: any = null;

    const config = {
      ...DEFAULT_CONNECTION_CONFIG,
      connectionType: ConnectionTypes.POSTGRESQL,
      parseToNeodashRecord: true,
    };

    await connectionModule.runQuery(
      { query: 'SELECT * FROM users' },
      {
        onSuccess: r => (result = r),
        setFields: f => (fields = f),
      },
      config
    );

    expect(fields).toBeDefined();
    expect(Array.isArray(fields)).toBe(true);
    expect(fields).toContain('id');
    expect(fields).toContain('name');
    expect(fields).toContain('email');
  });

  test('should execute read-only query with READ access mode', async () => {
    let result: any = null;
    let status: QueryStatus | null = null;

    const config = {
      ...DEFAULT_CONNECTION_CONFIG,
      connectionType: ConnectionTypes.POSTGRESQL,
      accessMode: 'READ' as any,
      parseToNeodashRecord: true,
    };

    await connectionModule.runQuery(
      { query: 'SELECT * FROM users' },
      {
        onSuccess: r => (result = r),
        setStatus: s => (status = s),
      },
      config
    );

    // onSuccess receives a flat NeodashRecord[] — no summary wrapper
    expect(status).toBe(QueryStatus.COMPLETE);
    expect(result).toHaveLength(2);
  });

  test('should execute write query with WRITE access mode', async () => {
    let status: QueryStatus | null = null;

    const config = {
      ...DEFAULT_CONNECTION_CONFIG,
      connectionType: ConnectionTypes.POSTGRESQL,
      accessMode: 'WRITE' as any,
      parseToNeodashRecord: true,
    };

    await connectionModule.runQuery(
      {
        query: 'INSERT INTO users (name, email, age) VALUES ($1, $2, $3)',
        params: { '0': 'Charlie', '1': 'charlie@example.com', '2': 35 },
      },
      {
        setStatus: s => (status = s),
      },
      config
    );

    // INSERT with affected rows → COMPLETE (rowCount from pg is 1, not 0)
    expect(status).toBe(QueryStatus.COMPLETE);
  });

  test('should handle timeout with proper status', async () => {
    let status: QueryStatus | null = null;
    let error: any = null;

    const config = {
      ...DEFAULT_CONNECTION_CONFIG,
      connectionType: ConnectionTypes.POSTGRESQL,
      timeout: 1, // 1ms timeout to force timeout
    };

    await connectionModule.runQuery(
      { query: 'SELECT pg_sleep(10)' }, // Sleep for 10 seconds
      {
        onFail: e => (error = e),
        setStatus: s => (status = s),
      },
      config
    );

    expect(status).toBe(QueryStatus.TIMED_OUT);
    expect(error).toBeDefined();
  });

  test('should return NeodashRecord instances when parseToNeodashRecord is true', async () => {
    let result: any = null;

    const config = {
      ...DEFAULT_CONNECTION_CONFIG,
      connectionType: ConnectionTypes.POSTGRESQL,
      parseToNeodashRecord: true,
    };

    await connectionModule.runQuery(
      { query: 'SELECT * FROM users WHERE name = $1', params: { '0': 'Alice' } },
      {
        onSuccess: r => (result = r),
      },
      config
    );

    // onSuccess receives a flat NeodashRecord[] — property access works via Proxy
    expect(result).toBeDefined();
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe('Alice');
    expect(result[0].email).toBe('alice@example.com');
  });

  test('should rollback transaction on error', async () => {
    let error: any = null;
    let status: QueryStatus | null = null;

    const config = {
      ...DEFAULT_CONNECTION_CONFIG,
      connectionType: ConnectionTypes.POSTGRESQL,
      accessMode: 'WRITE' as any,
    };

    await connectionModule.runQuery(
      {
        query: 'INSERT INTO users (name, email, age) VALUES ($1, $2, $3)',
        params: { '0': 'Dave', '1': 'alice@example.com', '2': 40 }, // Duplicate email should fail
      },
      {
        onFail: e => (error = e),
        setStatus: s => (status = s),
      },
      config
    );

    expect(status).toBe(QueryStatus.ERROR);
    expect(error).toBeDefined();

    // Verify transaction was rolled back by checking user wasn't inserted
    let result: any = null;
    await connectionModule.runQuery(
      { query: 'SELECT * FROM users WHERE name = $1', params: { '0': 'Dave' } },
      {
        onSuccess: r => (result = r),
      },
      { ...DEFAULT_CONNECTION_CONFIG, connectionType: ConnectionTypes.POSTGRESQL, parseToNeodashRecord: true }
    );

    expect(result).toHaveLength(0);
  });

  test('should handle COMPLETE_TRUNCATED status when row limit exceeded', async () => {
    let status: QueryStatus | null = null;
    let result: any = null;

    const config = {
      ...DEFAULT_CONNECTION_CONFIG,
      connectionType: ConnectionTypes.POSTGRESQL,
      rowLimit: 1,
      parseToNeodashRecord: true,
    };

    // Insert more data to test truncation
    const client = await connectionModule.getPool()!.connect();
    try {
      await client.query('INSERT INTO users (name, email, age) VALUES ($1, $2, $3)', [
        'Extra',
        'extra@example.com',
        28,
      ]);
    } finally {
      client.release();
    }

    await connectionModule.runQuery(
      { query: 'SELECT * FROM users' },
      {
        onSuccess: r => (result = r),
        setStatus: s => (status = s),
      },
      config
    );

    expect(status).toBe(QueryStatus.COMPLETE_TRUNCATED);
    expect(result).toHaveLength(1);
  });
});
