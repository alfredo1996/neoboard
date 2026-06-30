import { getNeo4jAuth } from "../utils/setup";
import { Neo4jConnectionModule } from "../../src/neo4j/Neo4jConnectionModule";
import { QueryCallback, QueryParams } from "@neoboard/connector-sdk";
import { NEO4J_TEST_CONNECTION_CONFIG } from "../utils/setup";
import { ConnectorError, ConnectorErrorType } from "@neoboard/connector-sdk";

describe("Query to Neo4j", () => {
  test("run MATCH (n) RETURN n LIMIT 1 and get Data", async () => {
    const config = getNeo4jAuth();
    const connection = new Neo4jConnectionModule(config);

    const queryParams: QueryParams = {
      query: "MATCH (n) RETURN n LIMIT 1",
      params: {},
    };

    const queryCallback: QueryCallback<any> = {
      onSuccess: (res) => {
        expect(res.length).toBeGreaterThan(0);
      },
      onFail: (err) => {
        console.error("Error executing query:", err);
      },
    };

    await connection.runQuery(
      queryParams,
      queryCallback,
      NEO4J_TEST_CONNECTION_CONFIG,
    );
  });

  test("Run MATCH (p:Person) RETURN p LIMIT 10 and get data", async () => {
    const config = getNeo4jAuth();
    const connection = new Neo4jConnectionModule(config);

    const queryParams: QueryParams = {
      query: "MATCH (p:Person) RETURN p LIMIT 10",
      params: {},
    };

    const queryCallback: QueryCallback<any> = {
      onSuccess: (res) => {
        expect(res.length).toBeGreaterThan(0);
      },
      onFail: (err) => {
        console.error("Error executing query:", err);
      },
    };

    await connection.runQuery(
      queryParams,
      queryCallback,
      NEO4J_TEST_CONNECTION_CONFIG,
    );
  });

  test("Triggering error by forcing query timeout", async () => {
    const config = getNeo4jAuth();
    const connection = new Neo4jConnectionModule(config);

    const queryParams: QueryParams = {
      // A slow-to-FIRST-ROW read, not merely a large one: a cartesian product
      // with a cross-node predicate can't be planner-optimised, and the single
      // count row only emerges after the whole product is enumerated — so the
      // streaming row-limit can't short-circuit it and the transaction timeout
      // fires. (A read that merely returns many rows now truncates fast instead
      // of timing out — the intended behaviour of the streaming row-limit fix.)
      query:
        "MATCH (a),(b),(c),(d),(e) WHERE id(a) <> id(b) RETURN count(*) AS total",
      params: {},
    };

    const queryCallback: QueryCallback<any> = {
      onSuccess: () => {
        throw Error("SHOULD FAIL");
      },
      onFail: (err) => {
        expect(err).toBeInstanceOf(ConnectorError);
        expect((err as ConnectorError).type).toBe(ConnectorErrorType.TIMEOUT);
        expect(err.message).toMatch(/The transaction has been terminated/);
      },
    };
    const connectionConfig = {
      ...NEO4J_TEST_CONNECTION_CONFIG,
      connectionTimeout: 100,
      timeout: 2000, // Short transaction timeout so the slow read trips it fast.
    };
    await connection.runQuery(queryParams, queryCallback, connectionConfig);
  });

  test("Triggering error by forcing query timeout on Write", async () => {
    const config = getNeo4jAuth();
    const connection = new Neo4jConnectionModule(config);

    const queryParams: QueryParams = {
      query: "WITH range(1, toInteger(2^48)) AS x UNWIND x as y RETURN y ",
      params: {},
    };

    const queryCallback: QueryCallback<any> = {
      onSuccess: () => {
        throw Error("SHOULD FAIL");
      },
      onFail: (err) => {
        expect(err).toBeInstanceOf(ConnectorError);
        expect((err as ConnectorError).type).toBe(ConnectorErrorType.TIMEOUT);
        expect(err.message).toMatch(/The transaction has been terminated/);
      },
    };
    const connectionConfig = {
      ...NEO4J_TEST_CONNECTION_CONFIG,
      connectionTimeout: 100,
      accessMode: "WRITE",
    };
    await connection.runQuery(queryParams, queryCallback, connectionConfig);
  });
});
