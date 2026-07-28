import { getNeo4jAuth } from "../../utils/setup";
import { Neo4jConnectionModule } from "../../../src/neo4j/Neo4jConnectionModule";
import { QueryCallback, QueryParams } from "@neoboard/connector-sdk";
import { NEO4J_TEST_CONNECTION_CONFIG } from "../../utils/setup";
import { NeodashRecord } from "@neoboard/connector-sdk";

describe("Neo4jRecordParser - Primitive Parsing", () => {
  test("should correctly parse a Neo4j Integer value", async () => {
    const config = getNeo4jAuth();
    const connection = new Neo4jConnectionModule(config);
    const queryParams: QueryParams = {
      query: "RETURN 42 AS number",
      params: {},
    };

    const queryCallback: QueryCallback<any> = {
      onSuccess: (result: NeodashRecord[]) => {
        expect(result.length).toBe(1);
        expect(result[0]["number"]).toBe(42);
      },
      onFail: (error) => {
        console.error("Error during query execution:", error);
        throw error;
      },
    };

    await connection.runQuery(
      queryParams,
      queryCallback,
      NEO4J_TEST_CONNECTION_CONFIG,
    );
  });

  test("should correctly parse a Neo4j big int value", async () => {
    const config = getNeo4jAuth();
    const connection = new Neo4jConnectionModule(config);
    const queryParams: QueryParams = {
      query: "RETURN 9223372036854775807 as number",
      params: {},
    };

    // expect.assertions guards against the case passing vacuously if
    // onSuccess is never invoked.
    expect.assertions(3);

    const queryCallback: QueryCallback<any> = {
      onSuccess: (result: NeodashRecord[]) => {
        expect(result.length).toBe(1);
        // A string, not a bigint. JSON.stringify cannot serialize a BigInt, so
        // the old value failed the WHOLE query with an opaque 500 the moment
        // it reached the API boundary — and disagreed with what PostgreSQL
        // emits for the same logical int8 (#1304).
        expect(result[0]["number"]).toBe("9223372036854775807");
        expect(() => JSON.stringify(result)).not.toThrow();
      },
      onFail: (error) => {
        console.error("Error during query execution:", error);
        throw error;
      },
    };

    await connection.runQuery(
      queryParams,
      queryCallback,
      NEO4J_TEST_CONNECTION_CONFIG,
    );
  });

  test("should correctly parse a Neo4j String value", async () => {
    const config = getNeo4jAuth();
    const connection = new Neo4jConnectionModule(config);
    const queryParams: QueryParams = {
      query: 'RETURN "hello world" AS message',
      params: {},
    };

    const queryCallback: QueryCallback<any> = {
      onSuccess: (result: NeodashRecord[]) => {
        expect(result.length).toBe(1);
        expect(result[0]["message"]).toBe("hello world");
        expect(typeof result[0]["message"]).toBe("string");
      },
      onFail: (error) => {
        console.error("Error during query execution:", error);
        throw error;
      },
    };

    await connection.runQuery(
      queryParams,
      queryCallback,
      NEO4J_TEST_CONNECTION_CONFIG,
    );
  });

  test("should correctly parse a Neo4j Boolean true value", async () => {
    const config = getNeo4jAuth();
    const connection = new Neo4jConnectionModule(config);
    const queryParams: QueryParams = {
      query: "RETURN true AS active",
      params: {},
    };

    const queryCallback: QueryCallback<any> = {
      onSuccess: (result: NeodashRecord[]) => {
        expect(result.length).toBe(1);
        expect(result[0]["active"]).toBe(true);
        expect(typeof result[0]["active"]).toBe("boolean"); // Ensure 'active' is of type boolean
      },
      onFail: (error) => {
        console.error("Error during query execution:", error);
        throw error;
      },
    };

    await connection.runQuery(
      queryParams,
      queryCallback,
      NEO4J_TEST_CONNECTION_CONFIG,
    );
  });

  test("should correctly parse a Neo4j Boolean false value", async () => {
    const config = getNeo4jAuth();
    const connection = new Neo4jConnectionModule(config);
    const queryParams: QueryParams = {
      query: "RETURN false AS active",
      params: {},
    };

    const queryCallback: QueryCallback<any> = {
      onSuccess: (result: NeodashRecord[]) => {
        expect(result.length).toBe(1);
        expect(result[0]["active"]).toBe(false);
        expect(typeof result[0]["active"]).toBe("boolean"); // Ensure 'active' is of type boolean
      },
      onFail: (error) => {
        console.error("Error during query execution:", error);
        throw error;
      },
    };

    await connection.runQuery(
      queryParams,
      queryCallback,
      NEO4J_TEST_CONNECTION_CONFIG,
    );
  });

  test('should correctly find the movie "The Matrix"', async () => {
    const config = getNeo4jAuth();

    const connection = new Neo4jConnectionModule(config);

    const queryParams: QueryParams = {
      query:
        'MATCH (m:Movie) WHERE m.title = "The Matrix" RETURN m.title AS title LIMIT 1',
      params: {},
    };

    const queryCallback: QueryCallback<any[]> = {
      onSuccess: (parsed) => {
        expect(parsed.length).toBe(1);

        expect(parsed[0]["title"]).toBe("The Matrix");

        expect(typeof parsed[0]["title"]).toBe("string");
      },
      onFail: (error) => {
        console.error("Error during query execution:", error);
        throw error;
      },
    };

    await connection.runQuery(
      queryParams,
      queryCallback,
      NEO4J_TEST_CONNECTION_CONFIG,
    );
  });

  test("should return null", async () => {
    const config = getNeo4jAuth();
    const connection = new Neo4jConnectionModule(config);

    const queryParams: QueryParams = {
      query: "RETURN null",
      params: {},
    };

    const queryCallback: QueryCallback<any> = {
      onSuccess: (parsed) => {
        // Verify that the result contains the 'null' key
        expect(parsed.length).toBe(1); // Since 'RETURN null' returns one record

        // Check that the 'null' key in the result is actually null
        expect(parsed[0]["null"]).toBe(null);
      },
      onFail: (error) => {
        console.error("Error during query execution:", error);
        throw error;
      },
    };

    await connection.runQuery(
      queryParams,
      queryCallback,
      NEO4J_TEST_CONNECTION_CONFIG,
    );
  });
});
