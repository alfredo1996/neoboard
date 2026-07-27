import { getNeo4jAuth } from "../../utils/setup";
import { Neo4jConnectionModule } from "../../../src/neo4j/Neo4jConnectionModule";
import { QueryCallback, QueryParams } from "@neoboard/connector-sdk";
import { NEO4J_TEST_CONNECTION_CONFIG } from "../../utils/setup";

describe("Neo4jRecordParser - Temporal Parsing", () => {
  test("should correctly parse a Neo4j Date value to YYYY-MM-DD string", async () => {
    const config = getNeo4jAuth();
    const connection = new Neo4jConnectionModule(config);

    const queryParams: QueryParams = {
      query: "RETURN date() AS currentDate",
      params: {},
    };

    const queryCallback: QueryCallback<any> = {
      onSuccess: (parsed) => {
        const currentDate = parsed[0]["currentDate"];
        expect(currentDate).toBeDefined();
        expect(typeof currentDate).toBe("string");
        // Expect YYYY-MM-DD format
        expect(currentDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
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

  test("should correctly parse a Neo4j DateTime value to formatted string", async () => {
    const config = getNeo4jAuth();

    const connection = new Neo4jConnectionModule(config);

    const queryParams: QueryParams = {
      query: "RETURN datetime() AS currentDateTime",
      params: {},
    };

    const queryCallback: QueryCallback<any> = {
      onSuccess: (parsed) => {
        const currentDateTime = parsed[0]["currentDateTime"];
        expect(currentDateTime).toBeDefined();
        expect(typeof currentDateTime).toBe("string");
        // ISO-8601 with a zone designator. The old space-separated form was
        // not ISO, so a client-side `new Date(str)` reinterpreted it in the
        // browser's local zone, and it carried no offset at all (#1306).
        expect(currentDateTime).toMatch(
          /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$/,
        );
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

  test("should correctly parse a Neo4j LocalDateTime value", async () => {
    const config = getNeo4jAuth();
    const connection = new Neo4jConnectionModule(config);

    const queryParams: QueryParams = {
      query: "RETURN localdatetime() AS currentLocalDateTime",
      params: {},
    };

    const queryCallback: QueryCallback<any> = {
      onSuccess: (parsed) => {
        const currentLocalDateTime = parsed[0]["currentLocalDateTime"];
        expect(currentLocalDateTime).toBeDefined();

        // A zone-LESS ISO string, not a Date. A Date is an absolute instant,
        // which is precisely what a localdatetime() is not (#1306).
        expect(typeof currentLocalDateTime).toBe("string");
        expect(currentLocalDateTime).toMatch(
          /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?$/,
        );
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

  test("should correctly parse a Neo4j Duration value", async () => {
    const config = getNeo4jAuth();
    const connection = new Neo4jConnectionModule(config);

    const queryParams: QueryParams = {
      query:
        "RETURN duration({months: 5, days: 10, seconds: 60, nanoseconds: 500}) AS period",
      params: {},
    };

    const queryCallback: QueryCallback<any> = {
      onSuccess: (parsed) => {
        const period = parsed[0]["period"];
        expect(period).toBeDefined();

        expect(period).toMatchObject({
          months: 5,
          days: 10,
          seconds: expect.any(Number),
          nanoseconds: expect.any(Number),
        });
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

  test("should correctly parse a Neo4j LocalTime value", async () => {
    const config = getNeo4jAuth();
    const connection = new Neo4jConnectionModule(config);

    const queryParams: QueryParams = {
      query: "RETURN localtime() AS currentTime",
      params: {},
    };

    const queryCallback: QueryCallback<any> = {
      onSuccess: (parsed) => {
        const currentTime = parsed[0]["currentTime"];
        expect(currentTime).toBeDefined();

        expect(typeof currentTime).toBe("string");

        // Exact widths: the old \d{1,2} / \d{1,9} form passed on "12:5:3.400",
        // which is what let a 10^6 nanosecond error through review (#1306).
        const timeFormatRegex = /^\d{2}:\d{2}:\d{2}\.\d{9}$/;
        expect(timeFormatRegex.test(currentTime)).toBe(true);
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

  test("should correctly parse a Neo4j Time value with offset", async () => {
    const config = getNeo4jAuth();
    const connection = new Neo4jConnectionModule(config);

    const queryParams: QueryParams = {
      query: "RETURN time() AS currentTimeWithOffset",
      params: {},
    };

    const queryCallback: QueryCallback<any> = {
      onSuccess: (parsed) => {
        const currentTimeWithOffset = parsed[0]["currentTimeWithOffset"];
        expect(currentTimeWithOffset).toBeDefined();

        expect(typeof currentTimeWithOffset).toBe("string");

        const timeWithOffsetRegex =
          /^\d{1,2}:\d{1,2}:\d{1,2}\.\d{1,9}[+-]\d{2}:\d{2}$/;
        expect(timeWithOffsetRegex.test(currentTimeWithOffset)).toBe(true);
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
