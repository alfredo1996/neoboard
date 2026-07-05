/**
 * Coverage gaps from #742 — PostgreSQL pool behavior, concurrent-write
 * isolation, parameter-injection safety, and module lifecycle.
 *
 * Runs against its own container so pool-size experiments can't interfere
 * with the shared global containers other suites use.
 */
import { PostgreSqlContainer } from "@testcontainers/postgresql";
import type { StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import { PostgresConnectionModule } from "../../src/postgresql/PostgresConnectionModule";
import {
  AuthType,
  ConnectionTypes,
  DEFAULT_CONNECTION_CONFIG,
  QueryStatus,
} from "@neoboard/connector-sdk";

jest.setTimeout(120_000);

let container: StartedPostgreSqlContainer;

const authConfigFor = () => ({
  username: container.getUsername(),
  password: container.getPassword(),
  authType: AuthType.NATIVE,
  uri: `postgresql://${container.getHost()}:${container.getPort()}/${container.getDatabase()}`,
});

const QUERY_CONFIG = {
  ...DEFAULT_CONNECTION_CONFIG,
  connectionType: ConnectionTypes.POSTGRESQL,
  timeout: 30_000,
};

const WRITE_CONFIG = { ...QUERY_CONFIG, accessMode: "WRITE" as const };

/** Run a query through the module, resolving with {status, error, result}. */
async function run(
  module: PostgresConnectionModule,
  query: string,
  params: Record<string, unknown> = {},
  config: Record<string, unknown> = QUERY_CONFIG,
) {
  let status: QueryStatus | null = null;
  let error: unknown = null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- test helper
  let result: any = null;
  let thrown: unknown = null;
  try {
    await module.runQuery(
      { query, params },
      {
        onSuccess: (r: unknown) => (result = r),
        onFail: (e: unknown) => (error = e),
        setStatus: (s: QueryStatus) => (status = s),
      },
      config,
    );
  } catch (e) {
    // Pool-acquisition failures happen before the query runs and are THROWN
    // by runQuery rather than routed to onFail — part of the contract these
    // tests pin down.
    thrown = e;
  }
  return { status, error, result, thrown };
}

beforeAll(async () => {
  container = await new PostgreSqlContainer("postgres:16-alpine").start();
});

afterAll(async () => {
  await container.stop();
});

describe("connection pool exhaustion (#742 item 11)", () => {
  it("serializes queries when the pool has a single client", async () => {
    const module = new PostgresConnectionModule(authConfigFor(), {
      pgMaxPoolSize: 1,
    });
    expect(await module.authModule.verifyAuthentication()).toBe(true);

    // Two 1-second sleeps through a max-1 pool must run back to back:
    // total wall clock ≥ ~2s proves the second query WAITED for the only
    // client instead of running in parallel or failing.
    const started = Date.now();
    const [a, b] = await Promise.all([
      run(module, "SELECT pg_sleep(1)"),
      run(module, "SELECT pg_sleep(1)"),
    ]);
    const elapsed = Date.now() - started;

    expect(a.status).toBe(QueryStatus.COMPLETE);
    expect(b.status).toBe(QueryStatus.COMPLETE);
    expect(elapsed).toBeGreaterThanOrEqual(1900);
    await module.close();
  });

  it("fails with an acquisition timeout when the pool never frees up", async () => {
    const module = new PostgresConnectionModule(authConfigFor(), {
      pgMaxPoolSize: 1,
      // Acquisition gives up long before the blocking query finishes.
      pgConnectionTimeoutMillis: 300,
    });
    expect(await module.authModule.verifyAuthentication()).toBe(true);

    const blocker = run(module, "SELECT pg_sleep(3)");
    // Give the blocker a moment to actually take the only client.
    await new Promise((r) => setTimeout(r, 200));
    const starved = await run(module, "SELECT 1");

    // Contract: acquisition failures are thrown from runQuery (they happen
    // before query execution, so the onFail path never engages).
    expect(starved.thrown).toBeTruthy();
    expect(String((starved.thrown as Error).message)).toMatch(
      /timeout|connect/i,
    );

    await blocker; // let the blocking query finish before closing
    await module.close();
  });
});

describe("concurrent write isolation (#742 item 19)", () => {
  it("N concurrent INSERTs through one pool all persist exactly once", async () => {
    const module = new PostgresConnectionModule(authConfigFor(), {
      pgMaxPoolSize: 4,
    });
    expect(await module.authModule.verifyAuthentication()).toBe(true);
    await run(
      module,
      "CREATE TABLE IF NOT EXISTS conc (id INT PRIMARY KEY, val TEXT)",
      {},
      WRITE_CONFIG,
    );

    const N = 10;
    const results = await Promise.all(
      Array.from({ length: N }, (_, i) =>
        run(
          module,
          "INSERT INTO conc (id, val) VALUES ($1, $2)",
          { "0": i, "1": `w${i}` },
          WRITE_CONFIG,
        ),
      ),
    );
    for (const r of results) expect(r.status).toBe(QueryStatus.COMPLETE);

    const count = await run(module, "SELECT COUNT(*)::int AS n FROM conc");
    expect(count.status).toBe(QueryStatus.COMPLETE);
    expect(Number(count.result[0].n)).toBe(N);
    await module.close();
  });
});

describe("parameter injection safety (#742 item 22)", () => {
  it("stores a SQL-injection payload literally instead of executing it", async () => {
    const module = new PostgresConnectionModule(authConfigFor());
    expect(await module.authModule.verifyAuthentication()).toBe(true);
    await run(
      module,
      "CREATE TABLE IF NOT EXISTS inj (id SERIAL PRIMARY KEY, val TEXT)",
      {},
      WRITE_CONFIG,
    );

    const payload = "'; DROP TABLE inj; --";
    const insert = await run(
      module,
      "INSERT INTO inj (val) VALUES ($1)",
      { "0": payload },
      WRITE_CONFIG,
    );
    expect(insert.status).toBe(QueryStatus.COMPLETE);

    // The table survived, and the payload is stored as an inert literal.
    const read = await run(module, "SELECT val FROM inj");
    expect(read.status).toBe(QueryStatus.COMPLETE);
    expect(read.result[0].val).toBe(payload);
    await module.close();
  });
});

describe("module lifecycle (#742 item 24)", () => {
  it("create → use → close → use-after-close re-authenticates (self-healing)", async () => {
    const module = new PostgresConnectionModule(authConfigFor());
    expect(await module.authModule.verifyAuthentication()).toBe(true);

    const before = await run(module, "SELECT 1 AS one");
    expect(before.status).toBe(QueryStatus.COMPLETE);

    await module.close();

    // Contract: runQuery re-verifies authentication, so a closed module
    // transparently reopens its pool instead of erroring — no hang, no
    // crash, and no zombie state. (The issue assumed use-after-close should
    // fail; the implemented behavior is deliberate self-healing.)
    const after = await run(module, "SELECT 1 AS one");
    expect(after.thrown).toBeNull();
    expect(after.status).toBe(QueryStatus.COMPLETE);

    await module.close();
  });
});
