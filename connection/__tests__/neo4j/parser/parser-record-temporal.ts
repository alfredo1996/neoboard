import { getNeo4jAuth } from "../../utils/setup";
import { Neo4jConnectionModule } from "../../../src/neo4j/Neo4jConnectionModule";
import { QueryCallback, QueryParams } from "@neoboard/connector-sdk";
/**
 * A parsed row: a plain object, column name → row value (#1904). `any` because
 * each test asserts a value's shape with expect(); a precise RowValue would
 * need a narrowing before every read (#1918).
 */
type NeodashRecord = Record<string, any>;
import { NEO4J_TEST_CONNECTION_CONFIG } from "../../utils/setup";

describe("Neo4jRecordParser - Temporal Parsing", () => {
  test("should correctly parse a Neo4j Date value to YYYY-MM-DD string", async () => {
    const config = getNeo4jAuth();
    const connection = new Neo4jConnectionModule(config);

    const queryParams: QueryParams = {
      query: "RETURN date() AS currentDate",
      params: {},
    };

    let parsed: NeodashRecord[] | undefined;
    const queryCallback: QueryCallback<any> = {
      onSuccess: (r) => {
        parsed = r;
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

    expect(parsed).toBeDefined();
    const currentDate = parsed![0]["currentDate"];
    expect(currentDate).toBeDefined();
    expect(typeof currentDate).toBe("string");
    // Expect YYYY-MM-DD format
    expect(currentDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  test("should correctly parse a Neo4j DateTime value to formatted string", async () => {
    const config = getNeo4jAuth();

    const connection = new Neo4jConnectionModule(config);

    const queryParams: QueryParams = {
      query: "RETURN datetime() AS currentDateTime",
      params: {},
    };

    let parsed: NeodashRecord[] | undefined;
    const queryCallback: QueryCallback<any> = {
      onSuccess: (r) => {
        parsed = r;
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

    expect(parsed).toBeDefined();
    const currentDateTime = parsed![0]["currentDateTime"];
    expect(currentDateTime).toBeDefined();
    expect(typeof currentDateTime).toBe("string");
    // ISO-8601 with a zone designator. The old space-separated form was
    // not ISO, so a client-side `new Date(str)` reinterpreted it in the
    // browser's local zone, and it carried no offset at all (#1306).
    expect(currentDateTime).toMatch(
      /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$/,
    );
  });

  test("should correctly parse a Neo4j LocalDateTime value", async () => {
    const config = getNeo4jAuth();
    const connection = new Neo4jConnectionModule(config);

    const queryParams: QueryParams = {
      query: "RETURN localdatetime() AS currentLocalDateTime",
      params: {},
    };

    let parsed: NeodashRecord[] | undefined;
    const queryCallback: QueryCallback<any> = {
      onSuccess: (r) => {
        parsed = r;
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

    expect(parsed).toBeDefined();
    const currentLocalDateTime = parsed![0]["currentLocalDateTime"];
    expect(currentLocalDateTime).toBeDefined();

    // A zone-LESS ISO string, not a Date. A Date is an absolute instant,
    // which is precisely what a localdatetime() is not (#1306).
    expect(typeof currentLocalDateTime).toBe("string");
    expect(currentLocalDateTime).toMatch(
      /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?$/,
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

    let parsed: NeodashRecord[] | undefined;
    const queryCallback: QueryCallback<any> = {
      onSuccess: (r) => {
        parsed = r;
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

    expect(parsed).toBeDefined();
    const period = parsed![0]["period"];
    expect(period).toBeDefined();

    // One ISO-8601 form from every connector (#1904) — it used to be a
    // {months, days, seconds, nanoseconds} object only this database emitted.
    expect(period).toBe("P5M10DT1M0.0000005S");
  });

  // Fixed values, not localtime(): the clock lands on a whole second now and
  // then, and the driver prints no fraction for 0 nanoseconds (#2391).
  test.each([
    [
      "with a fraction",
      "localtime({hour: 12, minute: 34, second: 56, nanosecond: 123000000})",
      "12:34:56.123000000",
    ],
    [
      "on a whole second",
      "localtime({hour: 12, minute: 34, second: 56})",
      "12:34:56",
    ],
  ])(
    "should correctly parse a Neo4j LocalTime value %s",
    async (_name, expr, expected) => {
      const connection = new Neo4jConnectionModule(getNeo4jAuth());

      let parsed: NeodashRecord[] | undefined;
      const queryCallback: QueryCallback<any> = {
        onSuccess: (r) => {
          parsed = r;
        },
        onFail: (error) => {
          console.error("Error during query execution:", error);
          throw error;
        },
      };

      await connection.runQuery(
        { query: `RETURN ${expr} AS t`, params: {} },
        queryCallback,
        NEO4J_TEST_CONNECTION_CONFIG,
      );

      expect(parsed![0].t).toBe(expected);
    },
  );

  test("should correctly parse a Neo4j Time value with offset", async () => {
    const config = getNeo4jAuth();
    const connection = new Neo4jConnectionModule(config);

    const queryParams: QueryParams = {
      query: "RETURN time() AS currentTimeWithOffset",
      params: {},
    };

    let parsed: NeodashRecord[] | undefined;
    const queryCallback: QueryCallback<any> = {
      onSuccess: (r) => {
        parsed = r;
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

    expect(parsed).toBeDefined();
    const currentTimeWithOffset = parsed![0]["currentTimeWithOffset"];
    expect(currentTimeWithOffset).toBeDefined();

    expect(typeof currentTimeWithOffset).toBe("string");

    const timeWithOffsetRegex =
      /^\d{1,2}:\d{1,2}:\d{1,2}\.\d{1,9}[+-]\d{2}:\d{2}$/;
    expect(timeWithOffsetRegex.test(currentTimeWithOffset)).toBe(true);
  });
});
