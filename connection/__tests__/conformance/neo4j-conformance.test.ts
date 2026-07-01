import { getNeo4jAuth, NEO4J_TEST_CONNECTION_CONFIG } from "../utils/setup";
import { Neo4jConnectionModule } from "../../src/neo4j/Neo4jConnectionModule";
import {
  buildConformanceCases,
  type ConformanceSetup,
} from "@neoboard/connector-sdk";

// #1122 — the built-in Neo4j connector must pass the shared query-safety
// conformance suite shipped from the SDK.
describe("Neo4j query-safety conformance (#1122)", () => {
  const connection = new Neo4jConnectionModule(getNeo4jAuth());

  const setup: ConformanceSetup = {
    baseConfig: NEO4J_TEST_CONNECTION_CONFIG,
    queries: {
      // A write — must be refused under READ access mode.
      write: { query: "CREATE (n:__ConformanceTmp) RETURN n" },
      // Returns exactly `n` rows.
      manyRows: (n) => ({
        query: "UNWIND range(1, $n) AS x RETURN x",
        params: { n },
      }),
      // A cartesian product large enough to always exceed a sub-second timeout.
      slow: {
        query:
          "UNWIND range(1, 1000000) AS a UNWIND range(1, 1000000) AS b RETURN count(*)",
      },
    },
  };

  afterAll(async () => {
    await connection.getDriver().close();
  });

  for (const testCase of buildConformanceCases(() => connection, setup)) {
    test(testCase.name, testCase.run);
  }
});
