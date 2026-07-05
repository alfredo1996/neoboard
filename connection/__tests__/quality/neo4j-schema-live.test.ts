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
import {
  AuthType,
  ConnectionTypes,
  DEFAULT_CONNECTION_CONFIG,
} from "@neoboard/connector-sdk";
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
  connectionType: ConnectionTypes.NEO4J,
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

    // Contract quirk worth pinning: rel-property keys come from
    // db.schema.relTypeProperties() and keep Neo4j's backtick quoting —
    // "`CT_WORKS_AT`", not "CT_WORKS_AT".
    const propsFor = (needle: string) => {
      const key = Object.keys(schema.relProperties).find((k) =>
        k.includes(needle),
      );
      return (schema.relProperties[key ?? ""] ?? []).map((p) => p.name);
    };
    expect(propsFor("CT_WORKS_AT")).toEqual(
      expect.arrayContaining(["ctSince", "ctRole"]),
    );
    expect(propsFor("CT_MANAGES")).toEqual(
      expect.arrayContaining(["ctTeamSize"]),
    );
  });

  it("maps node properties to their labels (backticked, multi-label combined keys)", async () => {
    const schema = (await new Neo4jSchemaManager().fetchSchema(getAuth())) as {
      nodeProperties: Record<string, Array<{ name: string; type: string }>>;
    };
    // Contract quirk worth pinning: node-property keys come from
    // db.schema.nodeTypeProperties() — backtick-quoted, and a dual-labeled
    // node yields ONE combined key ("`CoverageTestPerson`:`CoverageTestEmployee`").
    const propsFor = (needle: string) => {
      const key = Object.keys(schema.nodeProperties).find((k) =>
        k.includes(needle),
      );
      return (schema.nodeProperties[key ?? ""] ?? []).map((p) => p.name);
    };
    expect(propsFor("CoverageTestCompany")).toEqual(
      expect.arrayContaining(["ctName", "ctFounded"]),
    );
    expect(propsFor("CoverageTestPerson")).toEqual(
      expect.arrayContaining(["ctName", "ctAge", "ctBadge"]),
    );
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
