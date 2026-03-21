import { PostgresConnectionModule } from '../../src/postgresql/PostgresConnectionModule';
import { DEFAULT_CONNECTION_CONFIG, QueryStatus, AuthType, ConnectionTypes } from '../../src/generalized/interfaces';
import { PostgreSqlContainer } from '@testcontainers/postgresql';

describe('PostgreSQL Parameter Ordering', () => {
  let container: PostgreSqlContainer;
  let connectionModule: PostgresConnectionModule;

  const pgConfig = {
    ...DEFAULT_CONNECTION_CONFIG,
    connectionType: ConnectionTypes.POSTGRESQL,
    accessMode: 'WRITE' as const,
    parseToNeodashRecord: true,
    timeout: 0, // Skip SET statement_timeout — not testing timeout behavior here
  };

  beforeAll(async () => {
    container = await new PostgreSqlContainer().start();

    connectionModule = new PostgresConnectionModule({
      username: container.getUsername(),
      password: container.getPassword(),
      authType: AuthType.NATIVE,
      uri: `postgresql://${container.getHost()}:${container.getPort()}/${container.getDatabase()}`,
    });

    const authenticated = await connectionModule.authModule.verifyAuthentication();
    expect(authenticated).toBe(true);

    const client = await connectionModule.getPool()!.connect();
    try {
      await client.query(`
        CREATE TABLE param_test (
          id SERIAL PRIMARY KEY,
          name VARCHAR(255) NOT NULL,
          email VARCHAR(255),
          age INT
        )
      `);
    } finally {
      client.release();
    }
  }, 60000);

  afterAll(async () => {
    try { await connectionModule.close(); } catch (_) {}
    try { await container.stop(); } catch (_) {}
  });

  test('out-of-order numeric keys produce correct binding', async () => {
    let status: QueryStatus | null = null;
    let error: unknown = null;

    // Keys are deliberately out of order: "2", "0", "1"
    // After numeric sort: "0" → 'Alice', "1" → 'alice@test.com', "2" → 45
    await connectionModule.runQuery(
      {
        query: 'INSERT INTO param_test (name, email, age) VALUES ($1, $2, $3)',
        params: { '2': 45, '0': 'Alice', '1': 'alice@test.com' },
      },
      {
        onFail: (e) => { error = e; },
        setStatus: (s) => { status = s; },
      },
      pgConfig
    );

    expect(error).toBeNull();
    expect(status).toBe(QueryStatus.COMPLETE);

    // Verify the data was inserted correctly
    let result: any = null;
    await connectionModule.runQuery(
      {
        query: 'SELECT name, email, age FROM param_test WHERE name = $1',
        params: { '0': 'Alice' },
      },
      {
        onSuccess: (r) => { result = r; },
      },
      { ...pgConfig, accessMode: 'READ' }
    );

    expect(result).toHaveLength(1);
    expect(result[0].name).toBe('Alice');
    expect(result[0].email).toBe('alice@test.com');
    expect(result[0].age).toBe(45);
  });

  test('10+ params sorted numerically, not lexicographically', async () => {
    let status: QueryStatus | null = null;
    let error: unknown = null;

    // Create a table with many columns
    const client = await connectionModule.getPool()!.connect();
    try {
      await client.query(`
        CREATE TABLE many_params (
          col0 TEXT, col1 TEXT, col2 TEXT, col3 TEXT, col4 TEXT,
          col5 TEXT, col6 TEXT, col7 TEXT, col8 TEXT, col9 TEXT,
          col10 TEXT, col11 TEXT
        )
      `);
    } finally {
      client.release();
    }

    // Build params with keys "0" through "11"
    // Lexicographic sort would give: "0","1","10","11","2","3",...
    // Numeric sort gives: "0","1","2","3",...,"10","11"
    const params: Record<string, unknown> = {};
    for (let i = 0; i < 12; i++) {
      params[String(i)] = `val_${i}`;
    }

    await connectionModule.runQuery(
      {
        query: 'INSERT INTO many_params VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)',
        params,
      },
      {
        onFail: (e) => { error = e; },
        setStatus: (s) => { status = s; },
      },
      pgConfig
    );

    expect(error).toBeNull();
    expect(status).toBe(QueryStatus.COMPLETE);

    // Verify correct ordering — col10 should have "val_10", not "val_2" (which lexicographic would produce)
    let result: any = null;
    await connectionModule.runQuery(
      { query: 'SELECT * FROM many_params' },
      {
        onSuccess: (r) => { result = r; },
      },
      { ...pgConfig, accessMode: 'READ' }
    );

    expect(result).toHaveLength(1);
    expect(result[0].col0).toBe('val_0');
    expect(result[0].col1).toBe('val_1');
    expect(result[0].col2).toBe('val_2');
    expect(result[0].col9).toBe('val_9');
    expect(result[0].col10).toBe('val_10');
    expect(result[0].col11).toBe('val_11');
  });
});
