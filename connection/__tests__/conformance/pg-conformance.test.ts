import { PostgresConnectionModule } from "../../src/postgresql/PostgresConnectionModule";
import {
  PostgreSqlContainer,
  StartedPostgreSqlContainer,
} from "@testcontainers/postgresql";
import {
  DEFAULT_CONNECTION_CONFIG,
  AuthType,
  buildConformanceCases,
  type ConformanceSetup,
} from "@neoboard/connector-sdk";
import { CONTAINER_START_MS } from "../utils/container-start";

// #1122 — the built-in PostgreSQL connector must pass the shared query-safety
// conformance suite shipped from the SDK.
describe("PostgreSQL query-safety conformance (#1122)", () => {
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

  const setup: ConformanceSetup = {
    baseConfig: { ...DEFAULT_CONNECTION_CONFIG },
    queries: {
      // A DDL write — must be refused under READ access mode (READ ONLY txn).
      write: { query: "CREATE TABLE __conformance_tmp (x int)" },
      // Returns exactly `$param_rows` rows. The harness binds it by name, as
      // the app does; the rename to `$1` is the connector's own (#1898).
      manyRows: "SELECT i AS x FROM generate_series(1, $param_rows) AS i",
      // Produces no rows until it finishes; statement_timeout fires first.
      slow: { query: "SELECT pg_sleep(5)" },
      // The cancellation case aborts this one and asks the backend if it is gone.
      cancellable: { query: "SELECT pg_sleep(31)" },
      isQueryActive: async () => {
        const { rows } = await connection
          .getPool()!
          .query(
            "SELECT count(*)::int AS n FROM pg_stat_activity WHERE state = 'active' AND query LIKE '%pg_sleep(31)%' AND pid <> pg_backend_pid()",
          );
        return rows[0].n > 0;
      },
    },
  };

  for (const testCase of buildConformanceCases(() => connection, setup)) {
    test(testCase.name, testCase.run);
  }
});
