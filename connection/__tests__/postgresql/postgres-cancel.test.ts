import { PostgresConnectionModule } from "../../src/postgresql/PostgresConnectionModule";
import { DEFAULT_CONNECTION_CONFIG, AuthType } from "@neoboard/connector-sdk";
import {
  PostgreSqlContainer,
  type StartedPostgreSqlContainer,
} from "@testcontainers/postgresql";
import { CONTAINER_START_MS } from "../utils/container-start";

/** #2444: an aborted read ends on the database, not at its timeout. */
describe("PostgreSQL cancellation (#2444)", () => {
  let container: StartedPostgreSqlContainer;
  let connection: PostgresConnectionModule;

  beforeAll(async () => {
    container = await new PostgreSqlContainer("postgres:16-alpine").start();
    connection = new PostgresConnectionModule({
      username: container.getUsername(),
      password: container.getPassword(),
      authType: AuthType.NATIVE,
      uri: `postgresql://${container.getHost()}:${container.getPort()}/${container.getDatabase()}`,
    });
  }, CONTAINER_START_MS);

  afterAll(async () => {
    if (connection) await connection.close();
    if (container) await container.stop();
  });

  const sleepingBackends = async () => {
    const pool = connection.getPool()!;
    const { rows } = await pool.query(
      "SELECT count(*)::int AS n FROM pg_stat_activity WHERE state = 'active' AND query LIKE '%pg_sleep(30)%' AND pid <> pg_backend_pid()",
    );
    return rows[0].n as number;
  };

  const run = (accessMode: "READ" | "WRITE", signal: AbortSignal) => {
    const outcome: { error?: unknown; data?: unknown } = {};
    const done = connection.runQuery(
      { query: "SELECT pg_sleep(30)" },
      {
        onSuccess: (d) => {
          outcome.data = d;
        },
        onFail: (e) => {
          outcome.error = e;
        },
      },
      { ...DEFAULT_CONNECTION_CONFIG, accessMode, signal },
    );
    return { done, outcome };
  };

  test("pg_sleep(30) aborted after 1 s is gone from pg_stat_activity within 2 s", async () => {
    const controller = new AbortController();
    const { done, outcome } = run("READ", controller.signal);
    await new Promise((r) => setTimeout(r, 1000));
    expect(await sleepingBackends()).toBe(1);

    const abortedAt = Date.now();
    controller.abort();
    await done;

    expect(Date.now() - abortedAt).toBeLessThan(2000);
    expect(outcome.error).toBeDefined();
    expect(await sleepingBackends()).toBe(0);
  }, 20000);

  test("a signal already aborted never starts the statement", async () => {
    const controller = new AbortController();
    controller.abort();
    const connect = jest.spyOn(connection.getPool()!, "connect");
    const { done, outcome } = run("READ", controller.signal);
    await done;
    // No pool client, so no BEGIN, no SET, no statement and no cancel.
    expect(connect).not.toHaveBeenCalled();
    connect.mockRestore();
    expect(outcome.error).toBeDefined();
  }, 20000);

  test("a write ignores the signal and runs to its end", async () => {
    const controller = new AbortController();
    const { done, outcome } = run("WRITE", controller.signal);
    await new Promise((r) => setTimeout(r, 500));
    controller.abort();
    await new Promise((r) => setTimeout(r, 1000));
    // Still sleeping 1.5 s in: the abort did not cancel it.
    expect(await sleepingBackends()).toBe(1);
    expect(outcome.error).toBeUndefined();
    // Do not wait the full 30 s: end the backend ourselves.
    await connection
      .getPool()!
      .query(
        "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE query LIKE '%pg_sleep(30)%' AND pid <> pg_backend_pid()",
      );
    await done;
  }, 30000);
});
