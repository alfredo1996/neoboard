/**
 * Coverage gaps from #742 — Neo4j schema introspection against a live,
 * complex graph model (the existing neo4j-schema tests are driver-mocked),
 * plus Cypher parameter-injection safety.
 *
 * Uses its OWN container: schema introspection reads db.labels()/
 * db.schema.* globally, and other suites assert against the pristine movies
 * dataset on the shared container — parallel workers would see each other's
 * data (seeding there broke listDatabases/parser suites in the full run).
 */
import { Neo4jContainer } from "@testcontainers/neo4j";
import type { StartedNeo4jContainer } from "@testcontainers/neo4j";
import { Neo4jConnectionModule } from "../../src/neo4j/Neo4jConnectionModule";
import { Neo4jSchemaManager } from "../../src/schema/neo4j-schema";
import { AuthType, DEFAULT_CONNECTION_CONFIG } from "@neoboard/connector-sdk";
import type { QueryCallback, QueryParams } from "@neoboard/connector-sdk";

jest.setTimeout(180_000);

let container: StartedNeo4jContainer;
let connection: Neo4jConnectionModule;

const getAuth = () => ({
  uri: container.getBoltUri(),
  username: container.getUsername(),
  password: container.getPassword(),
  authType: AuthType.NATIVE,
});

const READ_CONFIG = {
  ...DEFAULT_CONNECTION_CONFIG,
  timeout: 20_000,
};

const WRITE_CONFIG = {
  ...READ_CONFIG,
  accessMode: "WRITE" as const,
};

async function runWrite(query: string, params: Record<string, unknown> = {}) {
  const queryParams: QueryParams = { query, params };
  let failure: unknown = null;
  const cb: QueryCallback<unknown> = {
    onSuccess: () => {},
    onFail: (e) => (failure = e),
  };
  await connection.runQuery(queryParams, cb, WRITE_CONFIG);
  if (failure) throw failure;
}

async function runRead(query: string, params: Record<string, unknown> = {}) {
  let rows: unknown[] = [];
  let failure: unknown = null;
  await connection.runQuery(
    { query, params },
    {
      onSuccess: (r: unknown[]) => (rows = r),
      onFail: (e: unknown) => (failure = e),
    },
    READ_CONFIG,
  );
  if (failure) throw failure;
  return rows;
}

beforeAll(async () => {
  container = await new Neo4jContainer("neo4j:5-community")
    .withPassword("schema-live-test-pw")
    .start();
  connection = new Neo4jConnectionModule(getAuth());
  // Complex model: three labels (one node dual-labeled), two relationship
  // types, distinct property sets per label and per relationship.
  await runWrite(`
    CREATE (c:CoverageTestCompany {ctName: 'Acme', ctFounded: 1999})
    CREATE (p:CoverageTestPerson:CoverageTestEmployee {ctName: 'Ada', ctAge: 36, ctBadge: 7})
    CREATE (p)-[:CT_WORKS_AT {ctSince: 2020, ctRole: 'engineer'}]->(c)
    CREATE (p)-[:CT_MANAGES {ctTeamSize: 4}]->(c)
  `);
});

afterAll(async () => {
  await connection?.getDriver().close();
  await container?.stop();
});

describe("Neo4j schema introspection — complex live model (#742 item 7)", () => {
  it("returns every label, including both labels of a dual-labeled node", async () => {
    const schema = await new Neo4jSchemaManager().fetchSchema(getAuth());
    expect(schema.type).toBe("neo4j");
    const labels = (schema as { labels: string[] }).labels;
    for (const l of [
      "CoverageTestCompany",
      "CoverageTestPerson",
      "CoverageTestEmployee",
    ]) {
      expect(labels).toContain(l);
    }
  });

  it("returns every relationship type with its properties", async () => {
    const schema = (await new Neo4jSchemaManager().fetchSchema(getAuth())) as {
      relationshipTypes: string[];
      relProperties: Record<string, Array<{ name: string; type: string }>>;
    };
    expect(schema.relationshipTypes).toContain("CT_WORKS_AT");
    expect(schema.relationshipTypes).toContain("CT_MANAGES");

    // Keys are the plain type name: Neo4j's backtick quoting is removed (#2415).
    const propsFor = (key: string) =>
      (schema.relProperties[key] ?? []).map((p) => p.name);
    expect(propsFor("CT_WORKS_AT")).toEqual(
      expect.arrayContaining(["ctSince", "ctRole"]),
    );
    expect(propsFor("CT_MANAGES")).toEqual(
      expect.arrayContaining(["ctTeamSize"]),
    );
  });

  it("maps node properties to their labels", async () => {
    const schema = (await new Neo4jSchemaManager().fetchSchema(getAuth())) as {
      nodeProperties: Record<string, Array<{ name: string; type: string }>>;
    };
    // Keys are plain labels: the quoting is removed, and a dual-labeled node's
    // properties are listed under each of its labels (#2415).
    const propsFor = (label: string) =>
      (schema.nodeProperties[label] ?? []).map((p) => p.name);
    expect(propsFor("CoverageTestCompany")).toEqual(
      expect.arrayContaining(["ctName", "ctFounded"]),
    );
    expect(propsFor("CoverageTestPerson")).toEqual(
      expect.arrayContaining(["ctName", "ctAge", "ctBadge"]),
    );
    // The dual-labeled node is listed under each of its labels.
    expect(propsFor("CoverageTestEmployee")).toEqual(
      expect.arrayContaining(["ctName", "ctAge", "ctBadge"]),
    );
    expect(
      Object.keys(schema.nodeProperties).some((k) => k.includes("`")),
    ).toBe(false);
  });
});

describe("Neo4j relationship patterns — live (#2508)", () => {
  const sorted = (p: { type: string; from: string; to: string }[] = []) =>
    [...p].sort((a, b) =>
      `${a.type}${a.from}${a.to}`.localeCompare(`${b.type}${b.from}${b.to}`),
    );

  it("reports the label pair of each relationship type, one pair per label of a multi-label node", async () => {
    const schema = await new Neo4jSchemaManager().fetchSchema(getAuth());
    const ours = (schema.relationshipPatterns ?? []).filter((p) =>
      p.type.startsWith("CT_"),
    );
    expect(sorted(ours)).toEqual([
      {
        type: "CT_MANAGES",
        from: "CoverageTestEmployee",
        to: "CoverageTestCompany",
      },
      {
        type: "CT_MANAGES",
        from: "CoverageTestPerson",
        to: "CoverageTestCompany",
      },
      {
        type: "CT_WORKS_AT",
        from: "CoverageTestEmployee",
        to: "CoverageTestCompany",
      },
      {
        type: "CT_WORKS_AT",
        from: "CoverageTestPerson",
        to: "CoverageTestCompany",
      },
    ]);
  });

  it("reads a relationship type whose name needs quoting", async () => {
    await runWrite(
      "CREATE (:CoverageTestBox)-[:`CT_HAS ``TICK`` X`]->(:CoverageTestBox)",
    );
    const schema = await new Neo4jSchemaManager().fetchSchema(getAuth());
    expect(schema.relationshipPatterns).toContainEqual({
      type: "CT_HAS `TICK` X",
      from: "CoverageTestBox",
      to: "CoverageTestBox",
    });
  });

  it("skips a type name with a backslash: \\u0060 would end the quoted identifier", async () => {
    for (const n of [
      "CT_BS\\u0060x",
      "CT_BS\\`",
      "CT_BS\\u0060]->() RETURN 1 //",
    ]) {
      await runWrite("CREATE (:CoverageTestBox)-[:$($n)]->(:CoverageTestBox)", {
        n,
      });
    }
    const schema = await new Neo4jSchemaManager().fetchSchema(getAuth());
    expect(schema.relationshipTypes).toContain("CT_BS\\u0060x");
    expect(
      (schema.relationshipPatterns ?? []).filter((p) =>
        p.type.startsWith("CT_BS"),
      ),
    ).toEqual([]);
  });
});

describe("Cypher parameter injection safety (#742 item 22)", () => {
  it("stores a Cypher-injection payload literally instead of executing it", async () => {
    const payload = "' DETACH DELETE n //";
    await runWrite(
      "CREATE (:CoverageTestNote {ctText: $text, ctName: 'inj-probe'})",
      { text: payload },
    );

    // The payload is inert data, and nothing else was deleted.
    const rows = (await runRead(
      "MATCH (n:CoverageTestNote {ctName: 'inj-probe'}) RETURN n.ctText AS t",
    )) as Array<Record<string, unknown>>;
    expect(rows).toHaveLength(1);
    expect(rows[0]["t"]).toBe(payload);

    const company = await runRead(
      "MATCH (c:CoverageTestCompany) RETURN count(c) AS n",
    );
    expect(company).toHaveLength(1);
  });
});
