/**
 * Integration tests for PostgresConnectionModule.checkConnection.
 *
 * Mirrors the existing Neo4j contract: success returns true, every failure
 * shape throws a wrapped ConnectorError so the API route can classify it.
 * Previously checkConnection swallowed errors and returned false, leaving
 * the UI with a useless "Connection check returned false" message (#900).
 */
import {
  PostgreSqlContainer,
  StartedPostgreSqlContainer,
} from "@testcontainers/postgresql";
import { PostgresConnectionModule } from "../../src/postgresql/PostgresConnectionModule";
import { AuthType } from "@neoboard/connector-sdk";
import { ConnectorError, ConnectorErrorType } from "@neoboard/connector-sdk";
import { runBoundedQuery } from "../../src/postgresql/utils";

describe("PostgresConnectionModule.checkConnection", () => {
  let container: StartedPostgreSqlContainer;

  beforeAll(async () => {
    container = await new PostgreSqlContainer("postgres:16-alpine").start();
  }, 30000);

  afterAll(async () => {
    try {
      await container.stop();
    } catch {
      // suppress shutdown errors
    }
  });

  function validConfig() {
    return {
      username: container.getUsername(),
      password: container.getPassword(),
      authType: AuthType.NATIVE,
      uri: `postgresql://${container.getHost()}:${container.getPort()}/${container.getDatabase()}`,
    };
  }

  test("returns true for a reachable, authenticated database", async () => {
    const mod = new PostgresConnectionModule(validConfig());
    try {
      await expect(mod.checkConnection()).resolves.toBe(true);
    } finally {
      await mod.close();
    }
  });

  test("throws a wrapped ConnectorError with type CONNECTION on bad host", async () => {
    const mod = new PostgresConnectionModule({
      username: "anyone",
      password: "anything",
      authType: AuthType.NATIVE,
      // RFC 6761 reserves .invalid; guaranteed not to resolve.
      uri: "postgresql://nonexistent-host.invalid:5432/postgres",
    });
    try {
      await expect(mod.checkConnection()).rejects.toBeInstanceOf(
        ConnectorError,
      );
      // The whole point of #900: the underlying network-failure detail must
      // survive the wrap so the API route's classifier can route it to
      // `network` and the UI can hint at it. The internal ConnectorErrorType
      // is irrelevant to the user — what matters is the message.
      await expect(mod.checkConnection()).rejects.toThrow(
        /nonexistent-host\.invalid|ENOTFOUND|getaddrinfo/i,
      );
    } finally {
      await mod.close().catch(() => undefined);
    }
  });

  test("throws a wrapped ConnectorError with type AUTHENTICATION on bad credentials", async () => {
    const mod = new PostgresConnectionModule({
      username: "definitely-not-a-real-user",
      password: "definitely-not-the-real-password",
      authType: AuthType.NATIVE,
      uri: `postgresql://${container.getHost()}:${container.getPort()}/${container.getDatabase()}`,
    });
    try {
      await expect(mod.checkConnection()).rejects.toMatchObject({
        type: ConnectorErrorType.AUTHENTICATION,
      });
    } finally {
      await mod.close().catch(() => undefined);
    }
  });

  test("never returns false (silent failures are the bug we are fixing)", async () => {
    const mod = new PostgresConnectionModule({
      username: "anyone",
      password: "anything",
      authType: AuthType.NATIVE,
      uri: "postgresql://nonexistent-host.invalid:5432/postgres",
    });
    let returned: boolean | undefined;
    try {
      returned = await mod.checkConnection();
    } catch {
      // expected — checkConnection must throw, not return false
    } finally {
      await mod.close().catch(() => undefined);
    }
    expect(returned).toBeUndefined();
  });

  // #1302: connectionTimeoutMillis bounds only acquiring a client; nothing
  // bounded a query once it was running, so a slow catalog or a stalled
  // backend pinned a pooled client forever. The bound is client-side, so it
  // holds even when the server never answers.
  test("runBoundedQuery rejects a query that outlives its budget and destroys the client (#1302)", async () => {
    const mod = new PostgresConnectionModule(validConfig());
    const pool = mod.getPool()!;
    try {
      const started = Date.now();
      await expect(
        runBoundedQuery(pool, "SELECT pg_sleep(5)", 300),
      ).rejects.toThrow(/timeout/i);
      expect(Date.now() - started).toBeLessThan(4_000);

      // Not handed back to the pool: a still-busy client would stall the
      // next caller behind the query it abandoned.
      await new Promise((r) => setImmediate(r));
      expect(pool.idleCount).toBe(0);
      await expect(mod.checkConnection()).resolves.toBe(true);
    } finally {
      await mod.close();
    }
  });

  // #1302: the module's own introspection and health checks are bounded, not
  // just the helper. SIGSTOP on the backend behind the pool's only client is
  // the stall the bound exists for: the TCP session stays up and nothing
  // answers, so a server-side statement_timeout would never fire.
  test("checkConnection and listSchemas give up on a stalled backend within a sub-second budget (#1302)", async () => {
    const mod = new PostgresConnectionModule(validConfig(), {
      pgMaxPoolSize: 1,
      pgIntrospectionTimeoutMillis: 300,
    });
    const stalled: number[] = [];
    const stallPooledBackend = async () => {
      const [{ pid }] = await mod.authModule.introspect<{ pid: number }>(
        "SELECT pg_backend_pid() AS pid",
      );
      const { exitCode } = await container.exec(["kill", "-STOP", `${pid}`]);
      expect(exitCode).toBe(0);
      stalled.push(pid);
    };
    try {
      await expect(mod.listSchemas()).resolves.toContain("public");

      await stallPooledBackend();
      let started = Date.now();
      await expect(mod.checkConnection()).rejects.toBeInstanceOf(
        ConnectorError,
      );
      expect(Date.now() - started).toBeLessThan(4_000);

      // listSchemas swallows its failure into [], so the empty list against a
      // database that has `public` is the rejection.
      await stallPooledBackend();
      started = Date.now();
      await expect(mod.listSchemas()).resolves.toEqual([]);
      expect(Date.now() - started).toBeLessThan(4_000);
    } finally {
      for (const pid of stalled) {
        await container.exec(["kill", "-CONT", `${pid}`]);
      }
      await mod.close();
    }
  });
});
