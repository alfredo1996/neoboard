import neo4j, { type Driver } from "neo4j-driver";
import { getNeo4jAuth } from "../utils/setup";
import { Neo4jSchemaManager } from "../../src/schema/neo4j-schema";

/**
 * #1919, live. The schema manager opened its sessions with no `database`, so a
 * connection pointed at a second database got the schema of the server's HOME
 * database — labels its queries never touch. Needs the Enterprise container
 * from the global setup: Community has one user database, so the bug cannot
 * show there.
 *
 * Each database gets a label of its own, planted here, so the test does not
 * depend on whatever the seed loaded. The database name is unique: two
 * checkouts can share one container (#1929).
 */
const suffix = `${Date.now()}${Math.floor(Math.random() * 1e6)}`;
const SECOND_DB = `schema1919x${suffix}`;
const HOME_LABEL = `HomeOnly${suffix}`;
const SECOND_LABEL = `SecondOnly${suffix}`;

let driver: Driver;

beforeAll(async () => {
  const auth = getNeo4jAuth();
  driver = neo4j.driver(
    auth.uri,
    neo4j.auth.basic(auth.username, auth.password),
  );
  const system = driver.session({ database: "system" });
  try {
    await system.run(`CREATE DATABASE \`${SECOND_DB}\` IF NOT EXISTS WAIT`);
  } finally {
    await system.close();
  }
  const home = driver.session();
  const second = driver.session({ database: SECOND_DB });
  try {
    await home.run(`CREATE (:\`${HOME_LABEL}\` {name: 'home'})`);
    await second.run(`CREATE (:\`${SECOND_LABEL}\` {name: 'second'})`);
  } finally {
    await home.close();
    await second.close();
  }
}, 120_000);

afterAll(async () => {
  const home = driver.session();
  const system = driver.session({ database: "system" });
  try {
    await home.run(`MATCH (n:\`${HOME_LABEL}\`) DELETE n`);
    await system.run(`DROP DATABASE \`${SECOND_DB}\` IF EXISTS WAIT`);
  } finally {
    await home.close();
    await system.close();
    await driver.close();
  }
}, 120_000);

describe("Neo4jSchemaManager against two databases (#1919)", () => {
  it("introspects the connection's database, not the home one", async () => {
    const schema = await new Neo4jSchemaManager().fetchSchema({
      ...getNeo4jAuth(),
      database: SECOND_DB,
    });

    expect(schema.labels).toContain(SECOND_LABEL);
    expect(schema.labels).not.toContain(HOME_LABEL);
  });

  it("still introspects the home database when none is set", async () => {
    const schema = await new Neo4jSchemaManager().fetchSchema(getNeo4jAuth());

    expect(schema.labels).toContain(HOME_LABEL);
    expect(schema.labels).not.toContain(SECOND_LABEL);
  });
});
