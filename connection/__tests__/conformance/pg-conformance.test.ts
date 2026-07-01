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
  }, 60_000);

  afterAll(async () => {
    if (connection) await connection.close();
    if (container) await container.stop();
  });

  const setup: ConformanceSetup = {
    baseConfig: { ...DEFAULT_CONNECTION_CONFIG },
    queries: {
      // A DDL write — must be refused under READ access mode (READ ONLY txn).
      write: { query: "CREATE TABLE __conformance_tmp (x int)" },
      // Returns exactly `n` rows.
      manyRows: (n) => ({
        query: "SELECT i AS x FROM generate_series(1, $1) AS i",
        params: { "0": n },
      }),
      // Produces no rows until it finishes; statement_timeout fires first.
      slow: { query: "SELECT pg_sleep(5)" },
    },
  };

  for (const testCase of buildConformanceCases(() => connection, setup)) {
    test(testCase.name, testCase.run);
  }
});
