import { getNeo4jAuth } from "../utils/setup";
import { Neo4jConnectionModule } from "../../src/neo4j/Neo4jConnectionModule";
import {
  QueryCallback,
  QueryParams,
  QueryStatus,
} from "@neoboard/connector-sdk";
import { NEO4J_TEST_CONNECTION_CONFIG } from "../utils/setup";
import {
  ConnectorError,
  ConnectorErrorType,
  NeodashRecord,
} from "@neoboard/connector-sdk";

describe("Query to Neo4j", () => {
  test("run MATCH (n) RETURN n LIMIT 1 and get Data", async () => {
    const config = getNeo4jAuth();
    const connection = new Neo4jConnectionModule(config);

    const queryParams: QueryParams = {
      query: "MATCH (n) RETURN n LIMIT 1",
      params: {},
    };

    // #1642: capture here, assert after the await — an expect() thrown inside
    // onSuccess is caught by the connector and would not fail the test.
    let res: NeodashRecord[] | undefined;
    const queryCallback: QueryCallback<any> = {
      onSuccess: (r) => {
        res = r;
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

    expect(res).toBeDefined();
    expect(res!.length).toBeGreaterThan(0);
  });

  test("Run MATCH (p:Person) RETURN p LIMIT 10 and get data", async () => {
    const config = getNeo4jAuth();
    const connection = new Neo4jConnectionModule(config);

    const queryParams: QueryParams = {
      query: "MATCH (p:Person) RETURN p LIMIT 10",
      params: {},
    };

    let res: NeodashRecord[] | undefined;
    const queryCallback: QueryCallback<any> = {
      onSuccess: (r) => {
        res = r;
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

    expect(res).toBeDefined();
    expect(res!.length).toBeGreaterThan(0);
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

  // #1642: the PostgreSQL module's comment claimed "Neo4j already upholds this
  // contract". It did not — onSuccess ran inside _runCypherQuery's try, so a
  // throwing consumer handler was caught, wrapped, and handed to onFail.
  test("a throwing onSuccess does not turn a successful query into a failure", async () => {
    const connection = new Neo4jConnectionModule(getNeo4jAuth());
    let succeeded = false;
    const failures: unknown[] = [];
    const statuses: QueryStatus[] = [];
    const consumerBug = new Error("consumer handler blew up");

    await expect(
      connection.runQuery(
        { query: "MATCH (n) RETURN n LIMIT 1", params: {} },
        {
          onSuccess: () => {
            succeeded = true;
            throw consumerBug;
          },
          onFail: (e) => failures.push(e),
          setStatus: (s) => statuses.push(s),
        },
        NEO4J_TEST_CONNECTION_CONFIG,
      ),
    ).rejects.toBe(consumerBug);

    expect(succeeded).toBe(true);
    expect(failures).toHaveLength(0);
    expect(statuses).toContain(QueryStatus.COMPLETE);
    expect(statuses).not.toContain(QueryStatus.ERROR);
  });

  test("an empty query with a throwing onSuccess rejects the same way", async () => {
    const connection = new Neo4jConnectionModule(getNeo4jAuth());
    const failures: unknown[] = [];
    const consumerBug = new Error("consumer handler blew up on empty");

    await expect(
      connection.runQuery(
        { query: "", params: {} },
        {
          onSuccess: () => {
            throw consumerBug;
          },
          onFail: (e) => failures.push(e),
          setStatus: () => {},
        },
        NEO4J_TEST_CONNECTION_CONFIG,
      ),
    ).rejects.toBe(consumerBug);
    expect(failures).toHaveLength(0);
  });
});
