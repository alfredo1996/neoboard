import { PostgresConnectionModule } from "../../src/postgresql/PostgresConnectionModule";
import {
  DEFAULT_CONNECTION_CONFIG,
  QueryStatus,
  AuthType,
} from "@neoboard/connector-sdk";
import { PostgreSqlContainer } from "@testcontainers/postgresql";

describe("PostgreSQL Parameter Ordering", () => {
  let container: PostgreSqlContainer;
  let connectionModule: PostgresConnectionModule;

  const pgConfig = {
    ...DEFAULT_CONNECTION_CONFIG,
    accessMode: "WRITE" as const,
    timeout: 0, // Skip SET statement_timeout — not testing timeout behavior here
  };

  beforeAll(async () => {
    container = await new PostgreSqlContainer("postgres:16-alpine").start();

    connectionModule = new PostgresConnectionModule({
      username: container.getUsername(),
      password: container.getPassword(),
      authType: AuthType.NATIVE,
      uri: `postgresql://${container.getHost()}:${container.getPort()}/${container.getDatabase()}`,
    });

    const authenticated =
      await connectionModule.authModule.verifyAuthentication();
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
    try {
      await connectionModule.close();
    } catch {
      // Best-effort teardown: the pool may already be closed, and a failure
      // here must not mask the test result.
    }
    try {
      await container.stop();
    } catch {
      // Same — a container that already exited is not a test failure.
    }
  });

  // The app sends NAMED parameters (#1898); the connector renames them to
  // node-pg's $1, $2, … and orders the values by where each name first appears
  // in the TEXT — never by the order of the map's keys.
  test("a map in a different order than the text binds by name", async () => {
    let status: QueryStatus | null = null;
    let error: unknown = null;

    // Keys are deliberately out of text order: age, name, email.
    await connectionModule.runQuery(
      {
        query:
          "INSERT INTO param_test (name, email, age) VALUES ($param_name, $param_email, $param_age)",
        params: {
          param_age: 45,
          param_name: "Alice",
          param_email: "alice@test.com",
        },
      },
      {
        onFail: (e) => {
          error = e;
        },
        setStatus: (s) => {
          status = s;
        },
      },
      pgConfig,
    );

    expect(error).toBeNull();
    expect(status).toBe(QueryStatus.COMPLETE);

    // Verify the data was inserted correctly
    let result: any = null;
    await connectionModule.runQuery(
      {
        query:
          "SELECT name, email, age FROM param_test WHERE name = $param_name OR name = $param_name",
        params: { param_name: "Alice" },
      },
      {
        onSuccess: (r) => {
          result = r;
        },
      },
      { ...pgConfig, accessMode: "READ" },
    );

    expect(result).toHaveLength(1);
    expect(result[0].name).toBe("Alice");
    expect(result[0].email).toBe("alice@test.com");
    expect(result[0].age).toBe(45);
  });

  test("10+ params bind in text order, not lexicographic order", async () => {
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

    // param_c0 … param_c11, inserted into the map in REVERSE. A lexicographic
    // sort of the names would give c0, c1, c10, c11, c2, …; map order would
    // give c11 … c0. Only the text order puts val_10 in col10.
    const names = Array.from({ length: 12 }, (_, i) => `param_c${i}`);
    const params: Record<string, unknown> = {};
    for (let i = 11; i >= 0; i--) {
      params[names[i]] = `val_${i}`;
    }

    await connectionModule.runQuery(
      {
        query: `INSERT INTO many_params VALUES (${names.map((n) => `$${n}`).join(",")})`,
        params,
      },
      {
        onFail: (e) => {
          error = e;
        },
        setStatus: (s) => {
          status = s;
        },
      },
      pgConfig,
    );

    expect(error).toBeNull();
    expect(status).toBe(QueryStatus.COMPLETE);

    // Verify correct ordering — col10 should have "val_10", not "val_2" (which lexicographic would produce)
    // or "val_1" (which map order would).
    let result: any = null;
    await connectionModule.runQuery(
      { query: "SELECT * FROM many_params" },
      {
        onSuccess: (r) => {
          result = r;
        },
      },
      { ...pgConfig, accessMode: "READ" },
    );

    expect(result).toHaveLength(1);
    expect(result[0].col0).toBe("val_0");
    expect(result[0].col1).toBe("val_1");
    expect(result[0].col2).toBe("val_2");
    expect(result[0].col9).toBe("val_9");
    expect(result[0].col10).toBe("val_10");
    expect(result[0].col11).toBe("val_11");
  });

  // #1516 end to end: an unbound parameter is an error naming it, never a
  // silent NULL — `LIMIT NULL` is no limit at all.
  test("a missing parameter fails, naming the parameter", async () => {
    let error: unknown = null;
    let result: unknown = null;

    await connectionModule.runQuery(
      {
        query: "SELECT name FROM param_test LIMIT $param_limit",
        params: {},
      },
      {
        onSuccess: (r) => {
          result = r;
        },
        onFail: (e) => {
          error = e;
        },
      },
      { ...pgConfig, accessMode: "READ" },
    );

    expect(result).toBeNull();
    expect((error as Error).message).toBe("Expected parameter(s): param_limit");
  });
});
