/**
 * #2508 — the graph schema reports which labels each relationship type joins.
 * Own container: schema introspection reads the whole database.
 */
import { Neo4jContainer } from "@testcontainers/neo4j";
import type { StartedNeo4jContainer } from "@testcontainers/neo4j";
import neo4j from "neo4j-driver";
import { Neo4jSchemaManager } from "../../src/schema/neo4j-schema";
import { AuthType } from "@neoboard/connector-sdk";

jest.setTimeout(180_000);

let container: StartedNeo4jContainer;

const cfg = () => ({
  uri: container.getBoltUri(),
  username: container.getUsername(),
  password: container.getPassword(),
  authType: AuthType.NATIVE,
});

async function write(query: string) {
  const driver = neo4j.driver(
    container.getBoltUri(),
    neo4j.auth.basic(container.getUsername(), container.getPassword()),
  );
  try {
    await driver.executeQuery(query);
  } finally {
    await driver.close();
  }
}

const sorted = (p: { type: string; from: string; to: string }[] = []) =>
  [...p].sort((a, b) =>
    `${a.type}${a.from}${a.to}`.localeCompare(`${b.type}${b.from}${b.to}`),
  );

beforeAll(async () => {
  container = await new Neo4jContainer("neo4j:5-community")
    .withPassword("rel-patterns-test-pw")
    .start();
});

afterAll(async () => {
  await container.stop();
});

describe("Neo4j relationship patterns (#2508)", () => {
  it("an empty database gives no patterns", async () => {
    const schema = await new Neo4jSchemaManager().fetchSchema(cfg());
    expect(schema.relationshipPatterns).toEqual([]);
  });

  it("reports the label pair of each relationship type, and one pair per label of a multi-label node", async () => {
    await write(`
      CREATE (p:Person {name:'a'}), (m:Movie {title:'t'}), (q:Person:Actor {name:'b'})
      CREATE (p)-[:ACTED_IN]->(m), (p)-[:DIRECTED]->(m), (q)-[:ACTED_IN]->(m)
    `);
    const schema = await new Neo4jSchemaManager().fetchSchema(cfg());
    expect(sorted(schema.relationshipPatterns)).toEqual([
      { type: "ACTED_IN", from: "Actor", to: "Movie" },
      { type: "ACTED_IN", from: "Person", to: "Movie" },
      { type: "DIRECTED", from: "Person", to: "Movie" },
    ]);
  });

  it("reads a relationship type whose name needs quoting", async () => {
    await write("CREATE (:Box)-[:`HAS ``TICK`` X`]->(:Box)");
    const schema = await new Neo4jSchemaManager().fetchSchema(cfg());
    expect(schema.relationshipPatterns).toContainEqual({
      type: "HAS `TICK` X",
      from: "Box",
      to: "Box",
    });
  });
});
