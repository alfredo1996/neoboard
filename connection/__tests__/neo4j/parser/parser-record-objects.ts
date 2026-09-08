import { getNeo4jAuth } from "../../utils/setup";
import { Neo4jConnectionModule } from "../../../src/neo4j/Neo4jConnectionModule";
import { QueryCallback, QueryParams } from "@neoboard/connector-sdk";
import { NEO4J_TEST_CONNECTION_CONFIG } from "../../utils/setup";
import { toNumber } from "neo4j-driver-core";

import { NeodashRecord } from "@neoboard/connector-sdk";

// #1642: assertions live AFTER the awaited runQuery, never inside onSuccess.
// onSuccess is invoked inside the connector's try block, so an expect() that
// throws there is swallowed by the connector's own error handling once it stops
// routing callback exceptions into onFail — the test would then pass silently.
// Each test captures the result in the callback and asserts on it outside.

describe("Neo4jRecordParser - Objects Parsing", () => {
  test('should correctly find the movie "The Matrix" as NODE', async () => {
    const config = getNeo4jAuth();

    const connection = new Neo4jConnectionModule(config);

    const queryParams: QueryParams = {
      query: 'MATCH (m:Movie) WHERE m.title = "The Matrix" RETURN m LIMIT 1',
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

    await connection.runQuery(
      queryParams,
      queryCallback,
      NEO4J_TEST_CONNECTION_CONFIG,
    );

    expect(result).toBeDefined();
    const movieNode = result![0]["m"];

    // parseGraphObject now returns a plain object with { identity, elementId, labels, properties }
    expect(movieNode).toHaveProperty("labels");
    expect(movieNode).toHaveProperty("properties");
    const movieNodeProperties = movieNode["properties"];
    // Assertions
    expect(movieNodeProperties.title).toBe("The Matrix");
    expect(movieNodeProperties.tagline).toBe("Welcome to the Real World");
    expect(toNumber(movieNodeProperties.released)).toBe(1999);

    expect(typeof movieNodeProperties.title).toBe("string");
    expect(typeof movieNodeProperties.tagline).toBe("string");
    expect(typeof toNumber(movieNodeProperties.released)).toBe("number");
  });

  test('should correctly find the relation "ACTED_IN" for movie "The Matrix"', async () => {
    const config = getNeo4jAuth();

    const connection = new Neo4jConnectionModule(config);

    const queryParams: QueryParams = {
      query:
        'MATCH (p:Person)-[r:ACTED_IN]->(m:Movie) WHERE m.title = "The Matrix" RETURN r LIMIT 1',
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

    await connection.runQuery(
      queryParams,
      queryCallback,
      NEO4J_TEST_CONNECTION_CONFIG,
    );

    expect(result).toBeDefined();
    const relationship = result![0]["r"];
    // parseGraphObject now returns a plain object (not a Relationship instance)
    expect(relationship).toHaveProperty("type");
    expect(relationship).toHaveProperty("properties");

    expect(relationship).toMatchObject({
      identity: expect.anything(),
      start: expect.anything(),
      end: expect.anything(),
      type: expect.anything(),
      properties: { roles: expect.anything() },
      elementId: expect.anything(),
      startNodeElementId: expect.anything(),
      endNodeElementId: expect.anything(),
    });
  });

  test("should correctly parse a Neo4j Path with ordered nodes", async () => {
    const config = getNeo4jAuth();
    const connection = new Neo4jConnectionModule(config);

    const queryParams: QueryParams = {
      query:
        "MATCH p = (a:Person)-[:ACTED_IN]->(m:Movie) WITH p ORDER BY ID(a), ID(m) RETURN p LIMIT 1",
      params: {},
    };

    // #1305: this callback used to be `() => {}`. The test passed as long as
    // the query did not throw, so it "covered" the Path branch while proving
    // nothing about it — and the branch returned the raw driver Path,
    // leaking every Integer inside it as {low, high}, for as long as the
    // test existed.
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

    await connection.runQuery(
      queryParams,
      queryCallback,
      NEO4J_TEST_CONNECTION_CONFIG,
    );

    expect(result).toBeDefined();
    const path = result![0]["p"];

    expect(path).toMatchObject({
      start: expect.anything(),
      end: expect.anything(),
      segments: expect.any(Array),
      length: expect.any(Number),
    });

    // Plain objects, not live driver instances.
    expect(path.start).toHaveProperty("labels");
    expect(path.start).toHaveProperty("properties");
    expect(path.segments[0].relationship).toHaveProperty("type");

    // The path ends on the Movie, whose `released` is a Neo4j Integer in
    // the source data. Strict typeof — `toNumber()` would accept an
    // unconverted Integer and assert nothing.
    expect(typeof path.end.properties.released).toBe("number");
    expect(typeof path.segments[0].end.properties.released).toBe("number");
    expect(typeof path.start.identity).toBe("number");

    // The assertion that generalises: any un-converted Integer anywhere in
    // the structure fails here, including in a shape nobody thought to
    // name.
    expect(JSON.stringify(path)).not.toContain('"low"');
  });

  test("should correctly parse complex array structures from Movie DB", async () => {
    const config = getNeo4jAuth();
    const connection = new Neo4jConnectionModule(config);

    const queryParams: QueryParams = {
      query: `
      MATCH (m:Movie)<-[:ACTED_IN]-(a:Person)
      WITH m.title AS movieTitle, collect(a.name) AS actorNames,
           [m.released, m.tagline, datetime()] AS mixedArray,
           [[1, 2], [3, 4]] AS nestedArray
      RETURN movieTitle, actorNames, mixedArray, nestedArray
      LIMIT 1
    `,
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
    const [record] = parsed!;

    // Types
    expect(Array.isArray(record["actorNames"])).toBe(true);
    expect(Array.isArray(record["mixedArray"])).toBe(true);
    expect(Array.isArray(record["nestedArray"])).toBe(true);
    expect(Array.isArray(record["nestedArray"][0])).toBe(true);

    // Inner values
    expect(typeof record["mixedArray"][0]).toBe("number"); // released
    expect(typeof record["mixedArray"][1]).toBe("string"); // tagline
    expect(typeof record["mixedArray"][2]).toBe("string"); // datetime → formatted string
  });

  test("should correctly parse a plain object with mixed types", async () => {
    const config = getNeo4jAuth();
    const connection = new Neo4jConnectionModule(config);

    const queryParams: QueryParams = {
      query: `
      RETURN {
        count: 123,
        flag: true,
        info: {
          label: "neo4j",
          created: datetime()
        }
      } AS data
    `,
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
    const data = parsed![0]["data"];

    expect(data.count).toBe(123);
    expect(data.flag).toBe(true);
    expect(data.info.label).toBe("neo4j");
    expect(typeof data.info.created).toBe("string"); // datetime → formatted string
  });

  test("Run MATCH (p:Person {name: $name}) RETURN p with parameter", async () => {
    const config = getNeo4jAuth();
    const connection = new Neo4jConnectionModule(config);

    const queryParams: QueryParams = {
      query: "MATCH (p:Person {name: $name}) RETURN p LIMIT 1",
      params: {
        name: "Tom Hanks",
      },
    };

    let parsed: NeodashRecord[] | undefined;
    const queryCallback: QueryCallback<any> = {
      onSuccess: (r) => {
        parsed = r;
      },
      onFail: (err) => {
        console.error("Error executing parameterized query:", err);
        throw err;
      },
    };

    await connection.runQuery(
      queryParams,
      queryCallback,
      NEO4J_TEST_CONNECTION_CONFIG,
    );

    expect(parsed).toBeDefined();
    expect(parsed!.length).toBe(1);

    const person = parsed![0]["p"];
    expect(person).toBeDefined();
    expect(person.labels).toContain("Person");
    expect(person.properties.name).toBe("Tom Hanks");
  });

  test("should correctly parse a Neo4j Point value", async () => {
    const config = getNeo4jAuth();
    const connection = new Neo4jConnectionModule(config);

    const queryParams: QueryParams = {
      query: "RETURN point({x: 1.2, y: 3.4, srid: 7203}) AS location",
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
    const location = parsed![0]["location"];
    expect(location).toBeDefined();

    expect(location.srid).toBe(7203);
    expect(location.x).toBe(1.2);
    expect(location.y).toBe(3.4);

    // Types
    expect(typeof location.x).toBe("number");
    expect(typeof location.y).toBe("number");
    expect(typeof location.srid).toBe("number");
  });

  test("should correctly parse a 3D Neo4j Point with z coordinate", async () => {
    const config = getNeo4jAuth();
    const connection = new Neo4jConnectionModule(config);

    const queryParams: QueryParams = {
      query:
        "RETURN point({x: 10.5, y: 20.5, z: 5.0, srid: 9157}) AS location3D",
      params: {},
    };

    let parsed: NeodashRecord[] | undefined;
    const queryCallback: QueryCallback<any> = {
      onSuccess: (r) => {
        parsed = r;
      },
      onFail: (err) => {
        console.error("Error during 3D point parsing:", err);
        throw err;
      },
    };

    await connection.runQuery(
      queryParams,
      queryCallback,
      NEO4J_TEST_CONNECTION_CONFIG,
    );

    expect(parsed).toBeDefined();
    const location = parsed![0]["location3D"];
    expect(location).toBeDefined();

    // Base fields
    expect(location["x"]).toBe(10.5);
    expect(location["y"]).toBe(20.5);
    expect(location["srid"]).toBe(9157);
    expect(location["z"]).toBe(5.0);
  });
});
