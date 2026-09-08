import { getNeo4jAuth } from "../../utils/setup";
import { Neo4jConnectionModule } from "../../../src/neo4j/Neo4jConnectionModule";
import { QueryCallback, QueryParams } from "@neoboard/connector-sdk";
import { NEO4J_TEST_CONNECTION_CONFIG } from "../../utils/setup";
import { NeodashRecord } from "@neoboard/connector-sdk";

// #1642: capture in onSuccess, assert after the await — an expect() thrown
// inside onSuccess is caught by the connector and would not fail the test.

describe("Neo4jRecordParser - config parseToNeodashRecord", () => {
  test("should return parsed NeodashRecord when parseToNeodashRecord is true", async () => {
    const config = getNeo4jAuth();

    const connection = new Neo4jConnectionModule(config);

    const queryParams: QueryParams = {
      query: "RETURN 42 AS number",
      params: {},
    };

    let result: NeodashRecord[] | undefined;
    const queryCallback: QueryCallback<any> = {
      onSuccess: (r: NeodashRecord[]) => {
        result = r;
      },
      onFail: (error) => {
        console.error("Error during query execution:", error);
        throw error;
      },
    };

    await connection.runQuery(queryParams, queryCallback, {
      ...NEO4J_TEST_CONNECTION_CONFIG,
      parseToNeodashRecord: true,
    });

    expect(result).toBeDefined();
    expect(result![0]["number"]).toBe(42);
    expect(result![0] instanceof NeodashRecord).toBe(true);
  });

  test("should return raw result when parseToNeodashRecord is false", async () => {
    const config = getNeo4jAuth();

    const connection = new Neo4jConnectionModule(config);

    const queryParams: QueryParams = {
      query: "RETURN 42 AS number",
      params: {},
    };

    let result: NeodashRecord[] | undefined;
    const queryCallback: QueryCallback<any> = {
      onSuccess: (r: NeodashRecord[]) => {
        result = r;
      },
      onFail: (error) => {
        console.error("Error during query execution:", error);
        throw error;
      },
    };

    await connection.runQuery(queryParams, queryCallback, {
      ...NEO4J_TEST_CONNECTION_CONFIG,
      parseToNeodashRecord: false,
    });

    expect(result).toBeDefined();
    expect(result![0] instanceof NeodashRecord).toBe(false);
  });
});
