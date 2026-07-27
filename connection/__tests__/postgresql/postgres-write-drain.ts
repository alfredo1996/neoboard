import { PostgresConnectionModule } from "../../src/postgresql/PostgresConnectionModule";
import {
  DEFAULT_CONNECTION_CONFIG,
  QueryStatus,
  AuthType,
  ConnectionTypes,
} from "@neoboard/connector-sdk";
import { PostgreSqlContainer } from "@testcontainers/postgresql";

/**
 * Write-path row limiting against a REAL PostgreSQL (#1298 / #1326).
 *
 * The write branch buffered the entire result set and sliced afterwards, so
 * `rowLimit` bounded what was displayed, not what was resident — one Form
 * submit against a large table could exhaust the heap shared by every tenant.
 *
 * The obvious fix is the dangerous one. `readBoundedCursor` performs ONE
 * bounded `cursor.read()` and closes the cursor in its `finally`. PostgreSQL
 * executes a portal incrementally, so an `UPDATE … RETURNING` suspended after
 * `rowLimit + 1` rows has NOT applied the rest, and closing the portal
 * abandons that work — turning "update 1,000 rows" into "update 11" while
 * still reporting success.
 *
 * These tests exist to make that failure impossible to ship. A stubbed client
 * cannot prove any of it; only a real database can.
 */
describe("PostgreSQL write path — row limit must not truncate side effects", () => {
  let container: PostgreSqlContainer;
  let connectionModule: PostgresConnectionModule;

  const ROW_COUNT = 1000;
  const ROW_LIMIT = 10;

  beforeAll(async () => {
    container = await new PostgreSqlContainer("postgres:16-alpine").start();

    connectionModule = new PostgresConnectionModule({
      username: container.getUsername(),
      password: container.getPassword(),
      authType: AuthType.NATIVE,
      uri: `postgresql://${container.getHost()}:${container.getPort()}/${container.getDatabase()}`,
    });

    expect(await connectionModule.authModule.verifyAuthentication()).toBe(true);

    const client = await connectionModule.getPool()!.connect();
    try {
      await client.query(
        `CREATE TABLE counters (id SERIAL PRIMARY KEY, n INT NOT NULL)`,
      );
      await client.query(
        `INSERT INTO counters (n) SELECT 0 FROM generate_series(1, $1)`,
        [ROW_COUNT],
      );
    } finally {
      client.release();
    }
  }, 120_000);

  afterAll(async () => {
    await connectionModule.close();
    await container?.stop();
  }, 60_000);

  /** Run a write query through the module and collect what the caller sees. */
  function runWrite(query: string) {
    return new Promise<{ rows: unknown[]; statuses: QueryStatus[] }>(
      (resolve, reject) => {
        const statuses: QueryStatus[] = [];
        connectionModule.runQuery(
          { query, parameters: {} },
          {
            onSuccess: (rows: unknown) =>
              resolve({ rows: rows as unknown[], statuses }),
            onFail: reject,
            setStatus: (s: QueryStatus) => statuses.push(s),
            setFields: () => {},
            setSchema: () => {},
          },
          {
            ...DEFAULT_CONNECTION_CONFIG,
            type: ConnectionTypes.POSTGRESQL,
            rowLimit: ROW_LIMIT,
            accessMode: "WRITE",
          },
        );
      },
    );
  }

  it("applies the UPDATE to EVERY row while returning at most rowLimit", async () => {
    const { rows } = await runWrite(
      `UPDATE counters SET n = n + 1 RETURNING *`,
    );

    // The caller sees only the capped page...
    expect(rows.length).toBeLessThanOrEqual(ROW_LIMIT);

    // ...but every row must have been updated. This is the assertion that
    // fails on any implementation which stops reading the portal early.
    const client = await connectionModule.getPool()!.connect();
    try {
      const { rows: check } = await client.query(
        `SELECT count(*)::int AS updated FROM counters WHERE n = 1`,
      );
      expect(check[0].updated).toBe(ROW_COUNT);
    } finally {
      client.release();
    }
  }, 60_000);

  it("still reports the affected-row count for an INSERT without RETURNING", async () => {
    // The buffered path was kept originally because result.rowCount is what
    // makes a non-returning write report COMPLETE rather than NO_DATA. Any
    // cursor-based rewrite has to preserve that.
    const { statuses } = await runWrite(
      `INSERT INTO counters (n) SELECT 99 FROM generate_series(1, 5)`,
    );

    expect(statuses).not.toContain(QueryStatus.NO_DATA);

    const client = await connectionModule.getPool()!.connect();
    try {
      const { rows: check } = await client.query(
        `SELECT count(*)::int AS inserted FROM counters WHERE n = 99`,
      );
      expect(check[0].inserted).toBe(5);
    } finally {
      client.release();
    }
  }, 60_000);

  it("flags truncation when a write returns more rows than the limit", async () => {
    const { statuses } = await runWrite(
      `UPDATE counters SET n = n WHERE n <> 99 RETURNING *`,
    );

    expect(statuses).toContain(QueryStatus.COMPLETE_TRUNCATED);
  }, 60_000);
});
