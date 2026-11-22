import { Neo4jSchemaManager } from "../../src/schema/neo4j-schema";
import { AuthType } from "@neoboard/connector-sdk";

// Module-level variable — safe to reference in hoisted mock factory
let _mockRun = jest.fn();

jest.mock("neo4j-driver", () => {
  const mockSession = {
    run: (...args: unknown[]) => _mockRun(...args),
    close: jest.fn().mockResolvedValue(undefined),
  };
  const mockDriver = {
    session: jest.fn().mockReturnValue(mockSession),
    close: jest.fn().mockResolvedValue(undefined),
  };
  return {
    __esModule: true,
    default: {
      driver: jest.fn().mockReturnValue(mockDriver),
      auth: {
        basic: jest.fn().mockReturnValue({}),
        none: jest.fn().mockReturnValue({}),
      },
      session: { READ: "READ", WRITE: "WRITE" },
      isInt: jest.fn().mockReturnValue(false),
    },
  };
});

jest.mock("../../src/neo4j/Neo4jConnectionModule", () => {
  const neo4j = require("neo4j-driver").default;
  const driver = neo4j.driver();
  return {
    Neo4jConnectionModule: jest.fn().mockImplementation(() => ({
      getDriver: () => driver,
    })),
  };
});

const authConfig = {
  uri: "bolt://localhost:7687",
  username: "neo4j",
  password: "password",
  authType: AuthType.NATIVE,
};

/** Helper: create a label record */
const labelRecord = (label: string) => ({ keys: ["label"], get: () => label });

/** Helper: create a relationshipType record */
const relTypeRecord = (rt: string) => ({
  keys: ["relationshipType"],
  get: () => rt,
});

/** Helper: create a nodeTypeProperties record */
const nodePropRecord = (
  nodeType: string,
  propertyName: string,
  propertyTypes: string[],
) => ({
  keys: ["nodeType", "propertyName", "propertyTypes"],
  get: (k: string) => ({ nodeType, propertyName, propertyTypes })[k],
});

/** Helper: create a relTypeProperties record */
const relPropRecord = (
  relType: string,
  propertyName: string,
  propertyTypes: string[],
) => ({
  keys: ["relType", "propertyName", "propertyTypes"],
  get: (k: string) => ({ relType, propertyName, propertyTypes })[k],
});

/**
 * The schema manager runs 4 Cypher queries in parallel.
 * Call order (Promise.all): labels, relationshipTypes, nodeTypeProperties, relTypeProperties.
 */
function mockFourCalls(
  labels: object[],
  relTypes: object[],
  nodeProps: object[],
  relProps: object[],
) {
  _mockRun
    .mockResolvedValueOnce({ records: labels })
    .mockResolvedValueOnce({ records: relTypes })
    .mockResolvedValueOnce({ records: nodeProps })
    .mockResolvedValueOnce({ records: relProps });
}

describe("Neo4jSchemaManager", () => {
  beforeEach(() => {
    _mockRun = jest.fn();
  });

  it("returns labels from db.labels()", async () => {
    mockFourCalls([labelRecord("Person"), labelRecord("Movie")], [], [], []);

    const schema = await new Neo4jSchemaManager().fetchSchema(authConfig);

    expect(schema.type).toBe("neo4j");
    expect(schema.labels).toEqual(["Person", "Movie"]);
  });

  it("returns relationship types from db.relationshipTypes()", async () => {
    mockFourCalls(
      [],
      [relTypeRecord("ACTED_IN"), relTypeRecord("DIRECTED")],
      [],
      [],
    );
    // one label-pair read per relationship type
    _mockRun.mockResolvedValue({ records: [] });

    const schema = await new Neo4jSchemaManager().fetchSchema(authConfig);

    expect(schema.relationshipTypes).toEqual(["ACTED_IN", "DIRECTED"]);
    expect(_mockRun.mock.calls.slice(4).map((c) => c[0])).toEqual([
      expect.stringContaining("[r:`ACTED_IN`]"),
      expect.stringContaining("[r:`DIRECTED`]"),
    ]);
  });

  it("gives no relationship patterns for an empty database", async () => {
    mockFourCalls([], [], [], []);
    const schema = await new Neo4jSchemaManager().fetchSchema(authConfig);
    expect(schema.relationshipPatterns).toEqual([]);
  });

  describe("relationship pattern sampling (#2508)", () => {
    const pair = (from: string[], to: string[]) => ({
      keys: ["from", "to"],
      get: (k: string) => (k === "from" ? from : to),
    });

    it.each([["I_\\u0060x"], ["I_\\`"], ["I_\\\\u0060"]])(
      "never puts a type name with a backslash (%s) into query text",
      async (bad) => {
        mockFourCalls([], [relTypeRecord(bad), relTypeRecord("GOOD")], [], []);
        _mockRun.mockResolvedValue({ records: [pair(["A"], ["B"])] });

        const schema = await new Neo4jSchemaManager().fetchSchema(authConfig);

        expect(_mockRun.mock.calls.map((c) => c[0]).join("\n")).not.toContain(
          "\\",
        );
        expect(schema.relationshipPatterns).toEqual([
          { type: "GOOD", from: "A", to: "B" },
        ]);
      },
    );

    it("a failed sample gives that type no pattern and keeps the rest", async () => {
      mockFourCalls([], [relTypeRecord("BAD"), relTypeRecord("GOOD")], [], []);
      _mockRun.mockImplementation((q: string) =>
        q.includes("`BAD`")
          ? Promise.reject(new Error("timeout"))
          : Promise.resolve({ records: [pair(["A"], ["B"])] }),
      );

      const schema = await new Neo4jSchemaManager().fetchSchema(authConfig);

      expect(schema.relationshipPatterns).toEqual([
        { type: "GOOD", from: "A", to: "B" },
      ]);
    });

    it("samples at most 8 types at once, and keeps the order of the types", async () => {
      const types = Array.from({ length: 20 }, (_, i) => `T${i}`);
      mockFourCalls([], types.map(relTypeRecord), [], []);
      let inFlight = 0;
      let peak = 0;
      _mockRun.mockImplementation(async (q: string) => {
        inFlight++;
        peak = Math.max(peak, inFlight);
        await new Promise((r) => setTimeout(r, 5));
        inFlight--;
        const type = /`(T\d+)`/.exec(q)![1];
        return { records: [pair([type], ["X"])] };
      });

      const schema = await new Neo4jSchemaManager().fetchSchema(authConfig);

      expect(peak).toBe(8);
      expect(schema.relationshipPatterns?.map((p) => p.type)).toEqual(types);
    });
  });

  it("normalises nodeProperties from nodeType procedure", async () => {
    mockFourCalls(
      [],
      [],
      [
        nodePropRecord(":Person", "name", ["String"]),
        nodePropRecord(":Person", "born", ["Long"]),
      ],
      [],
    );

    const schema = await new Neo4jSchemaManager().fetchSchema(authConfig);

    expect(schema.nodeProperties?.Person).toHaveLength(2);
    expect(schema.nodeProperties?.Person?.[0]).toMatchObject({
      name: "name",
      type: "String",
    });
    expect(schema.nodeProperties?.Person?.[1]).toMatchObject({
      name: "born",
      type: "Long",
    });
  });

  it("strips leading colon from nodeType and relType", async () => {
    mockFourCalls(
      [],
      [],
      [nodePropRecord(":Movie", "title", ["String"])],
      [relPropRecord(":ACTED_IN", "roles", ["StringArray"])],
    );

    const schema = await new Neo4jSchemaManager().fetchSchema(authConfig);

    expect(schema.nodeProperties?.Movie).toBeDefined();
    expect(schema.nodeProperties?.[":Movie"]).toBeUndefined();
    expect(schema.relProperties?.ACTED_IN).toBeDefined();
    expect(schema.relProperties?.[":ACTED_IN"]).toBeUndefined();
  });

  it("keys properties by the plain label, whatever Neo4j's quoting, and gives each label of a multi-label node its properties", async () => {
    mockFourCalls(
      [],
      [],
      [
        nodePropRecord(":`Movie`", "title", ["String"]),
        nodePropRecord(":`Person`:`Actor`", "name", ["String"]),
        nodePropRecord(":`Actor`", "name", ["String"]),
      ],
      [relPropRecord(":`ACTED_IN`", "roles", ["StringArray"])],
    );

    const schema = await new Neo4jSchemaManager().fetchSchema(authConfig);

    expect(schema.nodeProperties).toEqual({
      Movie: [{ name: "title", type: "String" }],
      Person: [{ name: "name", type: "String" }],
      Actor: [{ name: "name", type: "String" }],
    });
    expect(Object.keys(schema.relProperties ?? {})).toEqual(["ACTED_IN"]);
  });

  it("lists no property for a type the procedures report with none (a null name)", async () => {
    // Neo4j answers one row with a null propertyName for a type without properties.
    const none = null as unknown as string;
    mockFourCalls(
      [],
      [],
      [nodePropRecord(":`Tag`", none, [])],
      [relPropRecord(":`DIRECTED`", none, [])],
    );

    const schema = await new Neo4jSchemaManager().fetchSchema(authConfig);

    expect(schema.nodeProperties).toEqual({});
    expect(schema.relProperties).toEqual({});
  });

  it("reads a label or type named like an Object property as a name (CR3)", async () => {
    mockFourCalls(
      [labelRecord("constructor")],
      [relTypeRecord("toString")],
      [nodePropRecord(":`constructor`", "a", ["String"])],
      [relPropRecord(":`toString`", "b", ["String"])],
    );

    const schema = await new Neo4jSchemaManager().fetchSchema(authConfig);

    expect(schema.nodeProperties?.constructor).toEqual([
      { name: "a", type: "String" },
    ]);
    expect(schema.relProperties?.toString).toEqual([
      { name: "b", type: "String" },
    ]);
  });

  it("returns empty collections for empty databases", async () => {
    mockFourCalls([], [], [], []);

    const schema = await new Neo4jSchemaManager().fetchSchema(authConfig);

    expect(schema.labels).toEqual([]);
    expect(schema.relationshipTypes).toEqual([]);
    expect(schema.nodeProperties).toEqual({});
    expect(schema.relProperties).toEqual({});
  });

  // #1919: the sessions opened with no `database`, so a connection pointed at
  // `movies` got the schema of the server's HOME database — labels and
  // properties of a database its queries never touch.
  describe("which database it introspects (#1919)", () => {
    // The mocked driver's own session spy.
    const sessionSpy = () =>
      require("neo4j-driver").default.driver().session as jest.Mock;

    it.each([
      ["the connection's database", "movies", "movies"],
      ["the home database when none is set", undefined, undefined],
      ["the home database when the field is blank", "", undefined],
    ])("opens every session on %s", async (_label, database, expected) => {
      mockFourCalls([], [], [], []);
      sessionSpy().mockClear();

      await new Neo4jSchemaManager().fetchSchema({ ...authConfig, database });

      expect(sessionSpy()).toHaveBeenCalledTimes(4);
      for (const [options] of sessionSpy().mock.calls) {
        expect(options).toEqual({
          defaultAccessMode: "READ",
          database: expected,
        });
      }
    });
  });

  // #1302: each procedure ran as a bare session.run(query) with no transaction
  // timeout, so db.schema.nodeTypeProperties() on a big store could run for
  // as long as the server let it.
  it("bounds each introspection query: 30 s for the catalog reads, the budget for the two procedures", async () => {
    mockFourCalls([], [], [], []);

    await new Neo4jSchemaManager({ procedureTimeoutMs: 1234 }).fetchSchema(
      authConfig,
    );

    const timeoutOf = (needle: string) =>
      _mockRun.mock.calls.find((c) => String(c[0]).includes(needle))?.[2];
    expect(timeoutOf("db.labels")).toEqual({ timeout: 30_000 });
    expect(timeoutOf("db.relationshipTypes")).toEqual({ timeout: 30_000 });
    expect(timeoutOf("nodeTypeProperties")).toEqual({ timeout: 1234 });
    expect(timeoutOf("relTypeProperties")).toEqual({ timeout: 1234 });
  });

  it("samples a side whose procedure timed out, and fails on any other error", async () => {
    const timedOut = Object.assign(new Error("t"), {
      code: "Neo.ClientError.Transaction.TransactionTimedOut",
    });
    _mockRun = jest.fn(async (q: string) => {
      if (q.includes("db.labels")) return { records: [labelRecord("A")] };
      if (q.includes("nodeTypeProperties")) throw timedOut;
      if (q.includes("MATCH (n:`A`) WITH n LIMIT 1000")) {
        return {
          records: [
            {
              keys: ["propertyName", "propertyTypes"],
              get: (k: string) =>
                ({
                  propertyName: "p",
                  propertyTypes: ["LIST<STRING NOT NULL>"],
                })[k],
            },
          ],
        };
      }
      return { records: [] };
    });
    const schema = await new Neo4jSchemaManager().fetchSchema(authConfig);
    expect(schema.nodeProperties).toEqual({
      A: [{ name: "p", type: "StringArray" }],
    });

    _mockRun = jest.fn(async (q: string) => {
      if (q.includes("nodeTypeProperties")) throw new Error("boom");
      return { records: [] };
    });
    await expect(
      new Neo4jSchemaManager().fetchSchema(authConfig),
    ).rejects.toThrow("boom");
  });

  describe("sampling path (#2532)", () => {
    const timedOut = Object.assign(new Error("t"), {
      code: "Neo.ClientError.Transaction.TransactionTimedOut",
    });
    const rec = (propertyName: string, propertyTypes: unknown[]) => ({
      keys: ["propertyName", "propertyTypes"],
      get: (k: string) => ({ propertyName, propertyTypes })[k],
    });
    /** Procedures time out; `sample` answers the node sample query. */
    function sampling(
      label: string,
      sample: (q: string) => object[] | Promise<object[]>,
    ) {
      _mockRun = jest.fn(async (q: string) => {
        if (q.includes("db.labels")) return { records: [labelRecord(label)] };
        if (q.includes("nodeTypeProperties")) throw timedOut;
        if (q.includes("LIMIT 1000 UNWIND"))
          return { records: await sample(q) };
        return { records: [] };
      });
    }
    const nodeProps = async () =>
      (await new Neo4jSchemaManager().fetchSchema(authConfig)).nodeProperties;

    it.each(["a$`b", "a$&b", "a$$b", "a$'b"])(
      "quotes the label %s into the query verbatim, with no $-pattern expansion",
      async (label) => {
        sampling(label, () => []);
        await nodeProps();
        const q = _mockRun.mock.calls
          .map((c) => String(c[0]))
          .find((t) => t.includes("LIMIT 1000 UNWIND"));
        expect(q).toBe(
          `MATCH (n:\`${label.replaceAll("`", "``")}\`) WITH n LIMIT 1000 UNWIND keys(n) AS k ` +
            "RETURN k AS propertyName, collect(DISTINCT valueType(n[k])) AS propertyTypes",
        );
      },
    );

    it("takes the sample path when a procedure outlives the client deadline", async () => {
      _mockRun = jest.fn((q: string) => {
        if (q.includes("db.labels"))
          return Promise.resolve({ records: [labelRecord("A")] });
        if (q.includes("nodeTypeProperties"))
          return new Promise((resolve) =>
            setTimeout(
              () =>
                resolve({
                  records: [nodePropRecord(":`A`", "late", ["Long"])],
                }),
              150,
            ),
          );
        if (q.includes("LIMIT 1000 UNWIND"))
          return Promise.resolve({ records: [rec("p", ["STRING NOT NULL"])] });
        return Promise.resolve({ records: [] });
      });
      const schema = await new Neo4jSchemaManager({
        procedureTimeoutMs: 20,
      }).fetchSchema(authConfig);
      expect(schema.nodeProperties).toEqual({
        A: [{ name: "p", type: "String" }],
      });
      await new Promise((r) => setTimeout(r, 200));
    });

    it("maps the Cypher 25 names of the exact path to the Cypher 5 ones", async () => {
      _mockRun = jest.fn(async (q: string) => {
        if (q.includes("db.labels")) return { records: [labelRecord("A")] };
        if (q.includes("nodeTypeProperties"))
          return {
            records: [
              nodePropRecord(":`A`", "i", ["INTEGER NOT NULL"]),
              nodePropRecord(":`A`", "l", ["LIST<STRING NOT NULL> NOT NULL"]),
              nodePropRecord(":`A`", "d", ["DATE NOT NULL"]),
              nodePropRecord(":`A`", "pt", ["POINT NOT NULL"]),
              nodePropRecord(":`A`", "old", ["Long"]),
              nodePropRecord(":`A`", "oldl", ["StringArray"]),
            ],
          };
        return { records: [] };
      });
      expect(await nodeProps()).toEqual({
        A: [
          { name: "i", type: "Long" },
          { name: "l", type: "StringArray" },
          { name: "d", type: "Date" },
          { name: "pt", type: "Point" },
          { name: "old", type: "Long" },
          { name: "oldl", type: "StringArray" },
        ],
      });
    });

    it("types an empty list as the exact path does, and picks one type of several deterministically", async () => {
      sampling("A", () => [
        rec("e", ["LIST<NOTHING> NOT NULL"]),
        rec("m", ["STRING NOT NULL", "INTEGER NOT NULL"]),
        rec("m2", ["INTEGER NOT NULL", "STRING NOT NULL"]),
      ]);
      expect(await nodeProps()).toEqual({
        A: [
          { name: "e", type: "StringArray" },
          { name: "m", type: "Long" },
          { name: "m2", type: "Long" },
        ],
      });
    });

    it("keeps the names, with no type, on a server without valueType()", async () => {
      sampling("A", (q) => {
        if (q.includes("valueType"))
          throw Object.assign(new Error("Unknown function 'valueType'"), {
            code: "Neo.ClientError.Statement.SyntaxError",
          });
        return [rec("p", [])];
      });
      expect(await nodeProps()).toEqual({ A: [{ name: "p", type: "" }] });
    });

    it("does not read another error of the typed query as a missing valueType()", async () => {
      sampling("A", (q) => {
        if (q.includes("valueType")) throw new Error("connection reset");
        return [rec("p", [])];
      });
      expect(await nodeProps()).toEqual({});
    });
  });
});
