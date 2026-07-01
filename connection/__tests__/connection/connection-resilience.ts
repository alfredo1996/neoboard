import { getNeo4jAuth, NEO4J_TEST_CONNECTION_CONFIG } from "../utils/setup";
import { Neo4jConnectionModule } from "../../src/neo4j/Neo4jConnectionModule";
import { PostgresConnectionModule } from "../../src/postgresql/PostgresConnectionModule";
import {
  DEFAULT_CONNECTION_CONFIG,
  QueryCallback,
  QueryParams,
  QueryStatus,
  AuthType,
  ConnectionTypes,
} from "@neoboard/connector-sdk";
import { PostgreSqlContainer } from "@testcontainers/postgresql";

describe("Connection Resilience — Neo4j", () => {
  test("follow-up query works after a query error", async () => {
    const config = getNeo4jAuth();
    const connection = new Neo4jConnectionModule(config);

    // First: run an invalid query that will fail
    let firstError: unknown = null;
    await connection.runQuery(
      { query: "INVALID CYPHER SYNTAX !!!", params: {} },
      {
        onFail: (err) => {
          firstError = err;
        },
        setStatus: () => {},
      },
      NEO4J_TEST_CONNECTION_CONFIG,
    );
    expect(firstError).toBeDefined();

    // Second: run a valid query — session should be properly cleaned up
    let result: any = null;
    let status: QueryStatus | null = null;
    await connection.runQuery(
      { query: "RETURN 1 AS value", params: {} },
      {
        onSuccess: (r) => {
          result = r;
        },
        setStatus: (s) => {
          status = s;
        },
      },
      NEO4J_TEST_CONNECTION_CONFIG,
    );
    expect(status).toBe(QueryStatus.COMPLETE);
    expect(result).toBeDefined();
  });

  test("multiple driver.close() calls are safe (idempotent)", async () => {
    const config = getNeo4jAuth();
    const connection = new Neo4jConnectionModule(config);

    const driver = connection.getDriver();
    await driver.close();
    // Second close should not throw
    await expect(driver.close()).resolves.not.toThrow();
  });

  test("query with params: {} succeeds", async () => {
    const config = getNeo4jAuth();
    const connection = new Neo4jConnectionModule(config);

    let status: QueryStatus | null = null;
    await connection.runQuery(
      { query: "RETURN 1 AS value", params: {} },
      {
        setStatus: (s) => {
          status = s;
        },
      },
      NEO4J_TEST_CONNECTION_CONFIG,
    );
    expect(status).toBe(QueryStatus.COMPLETE);
  });

  test("query with params: undefined succeeds", async () => {
    const config = getNeo4jAuth();
    const connection = new Neo4jConnectionModule(config);

    let status: QueryStatus | null = null;
    await connection.runQuery(
      { query: "RETURN 1 AS value" }, // no params key at all
      {
        setStatus: (s) => {
          status = s;
        },
      },
      NEO4J_TEST_CONNECTION_CONFIG,
    );
    expect(status).toBe(QueryStatus.COMPLETE);
  });
});

describe("Connection Resilience — PostgreSQL", () => {
  let container: PostgreSqlContainer;
  let connectionModule: PostgresConnectionModule;

  const pgConfig = {
    ...DEFAULT_CONNECTION_CONFIG,
    connectionType: ConnectionTypes.POSTGRESQL,
    parseToNeodashRecord: true,
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

    // Create a simple table for testing
    const client = await connectionModule.getPool()!.connect();
    try {
      await client.query(
        "CREATE TABLE resilience_test (id SERIAL PRIMARY KEY, name TEXT)",
      );
      await client.query("INSERT INTO resilience_test (name) VALUES ('seed')");
    } finally {
      client.release();
    }
  }, 60000);

  afterAll(async () => {
    try {
      await connectionModule.close();
    } catch (_) {}
    try {
      await container.stop();
    } catch (_) {}
  });

  test("backend termination mid-query rejects cleanly — no unhandled 'error' event (#999)", async () => {
    const crashes: unknown[] = [];
    const onUncaught = (err: unknown) => crashes.push(err);
    process.on("uncaughtException", onUncaught);

    try {
      // Identify and kill our own backend from a second connection while
      // a slow query is in flight — exactly the CI teardown race that
      // used to kill the whole Jest process.
      const slow = new Promise<{ ok: boolean; error?: unknown }>((resolve) => {
        connectionModule.runQuery(
          { query: "SELECT pg_sleep(10)", params: {} },
          {
            onSuccess: () => resolve({ ok: true }),
            onFail: (error: unknown) => resolve({ ok: false, error }),
          },
          pgConfig,
        );
      });

      // Give the slow query time to check out a client and start.
      await new Promise((r) => setTimeout(r, 500));

      const { Client } = require("pg");
      const admin = new Client({
        host: container.getHost(),
        port: container.getPort(),
        user: container.getUsername(),
        password: container.getPassword(),
        database: container.getDatabase(),
      });
      await admin.connect();
      await admin.query(
        "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE query LIKE '%pg_sleep(10)%' AND pid <> pg_backend_pid()",
      );
      await admin.end();

      const result = await slow;
      // The in-flight query must reject through the normal path…
      expect(result.ok).toBe(false);
      // …and nothing may escape as an unhandled 'error' event.
      await new Promise((r) => setTimeout(r, 300));
      expect(crashes).toEqual([]);
    } finally {
      process.removeListener("uncaughtException", onUncaught);
    }
  }, 30_000);

  test("follow-up query works after a query error", async () => {
    // First: run a query that will fail
    let firstError: unknown = null;
    await connectionModule.runQuery(
      { query: "SELECT * FROM nonexistent_table_xyz" },
      {
        onFail: (e) => {
          firstError = e;
        },
        setStatus: () => {},
      },
      pgConfig,
    );
    expect(firstError).toBeDefined();

    // Second: client should have been released back to pool
    let result: any = null;
    let status: QueryStatus | null = null;
    await connectionModule.runQuery(
      { query: "SELECT * FROM resilience_test" },
      {
        onSuccess: (r) => {
          result = r;
        },
        setStatus: (s) => {
          status = s;
        },
      },
      pgConfig,
    );
    expect(status).toBe(QueryStatus.COMPLETE);
    expect(result).toHaveLength(1);
  });

  test("multiple close() calls are safe (idempotent)", async () => {
    // Create a disposable module for this test
    const disposable = new PostgresConnectionModule({
      username: container.getUsername(),
      password: container.getPassword(),
      authType: AuthType.NATIVE,
      uri: `postgresql://${container.getHost()}:${container.getPort()}/${container.getDatabase()}`,
    });
    await disposable.authModule.verifyAuthentication();

    await disposable.close();
    // Second close should not throw
    await expect(disposable.close()).resolves.not.toThrow();
  });

  test("query with params: {} succeeds", async () => {
    let status: QueryStatus | null = null;
    await connectionModule.runQuery(
      { query: "SELECT * FROM resilience_test", params: {} },
      {
        setStatus: (s) => {
          status = s;
        },
      },
      pgConfig,
    );
    expect(status).toBe(QueryStatus.COMPLETE);
  });

  test("query with params: undefined succeeds", async () => {
    let status: QueryStatus | null = null;
    await connectionModule.runQuery(
      { query: "SELECT * FROM resilience_test" }, // no params key
      {
        setStatus: (s) => {
          status = s;
        },
      },
      pgConfig,
    );
    expect(status).toBe(QueryStatus.COMPLETE);
  });
});
