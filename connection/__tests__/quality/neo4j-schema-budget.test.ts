/**
 * #2532 — the exact property procedures run under a time budget; past it the
 * properties come from per-label samples. Own container: the schema read is
 * global, and the seed here must not leak into other suites.
 */
import { Neo4jContainer } from "@testcontainers/neo4j";
import type { StartedNeo4jContainer } from "@testcontainers/neo4j";
import neo4j from "neo4j-driver";
import { Neo4jSchemaManager } from "../../src/schema/neo4j-schema";
import { AuthType } from "@neoboard/connector-sdk";

jest.setTimeout(240_000);

let container: StartedNeo4jContainer;
const auth = () => ({
  uri: container.getBoltUri(),
  username: container.getUsername(),
  password: container.getPassword(),
  authType: AuthType.NATIVE,
});

beforeAll(async () => {
  container = await new Neo4jContainer("neo4j:5-community")
    .withPassword("schema-budget-pw")
    .start();
  const driver = neo4j.driver(
    container.getBoltUri(),
    neo4j.auth.basic(container.getUsername(), "schema-budget-pw"),
  );
  const session = driver.session();
  try {
    // 5,000 Big nodes, created in id order. The sample reads the first 1,000
    // of a label scan (ascending id), so the one node created last, with
    // rareProp, is out of its reach: only the exact procedure can find it.
    await session.run(
      "UNWIND range(1, 4999) AS i CREATE (:Big {name: 'n' + i, size: i})",
    );
    await session.run("CREATE (:Big {name: 'last', size: 0, rareProp: true})");
    await session.run(`
      CREATE (a:Typed {s: 'x', i: 1, f: 1.5, b: true, ss: ['a'], ii: [1],
        ff: [1.5], bb: [true], d: date('2026-01-01'),
        dt: datetime('2026-01-01T10:00:00Z'),
        ldt: localdatetime('2026-01-01T10:00:00'), t: time('10:00:00Z'),
        lt: localtime('10:00:00'), du: duration('P1D'), p: point({x: 1, y: 2})})
      CREATE (b:Typed:Big {name: 'both'})
      CREATE (a)-[:LINKS {since: 2020, note: 'n'}]->(b)
    `);
  } finally {
    await session.close();
    await driver.close();
  }
});

afterAll(async () => {
  await container?.stop();
});

type Props = Record<string, Array<{ name: string; type: string }>>;
const sorted = (p: Props, k: string) =>
  [...(p[k] ?? [])].sort((x, y) => x.name.localeCompare(y.name));

describe("Neo4j schema introspection under a budget (#2532)", () => {
  it("uses the exact path on a normal budget: a property on one node in 5,000 is found", async () => {
    const schema = await new Neo4jSchemaManager().fetchSchema(auth());
    expect((schema.nodeProperties as Props).Big.map((p) => p.name)).toContain(
      "rareProp",
    );
  });

  it("samples every label and type when the budget is exceeded, with the exact path's types", async () => {
    const exact = await new Neo4jSchemaManager().fetchSchema(auth());
    // The server only checks transaction timeouts about once a second, so a
    // tiny budget does not reliably abort a procedure that takes milliseconds.
    // Instead the two procedures are made to fail with the server's own
    // timeout code; every other query, the samples included, hits the real server.
    const timedOut = Object.assign(new Error("transaction timed out"), {
      code: "Neo.ClientError.Transaction.TransactionTimedOutClientConfiguration",
    });
    const realDriver = neo4j.driver;
    const spy = jest.spyOn(neo4j, "driver").mockImplementation((...args) => {
      const driver = realDriver(...args);
      const open = driver.session.bind(driver);
      driver.session = (config) => {
        const session = open(config);
        const run = session.run.bind(session);
        session.run = ((query: string, ...rest: unknown[]) =>
          /TypeProperties\(\)/.test(query)
            ? Promise.reject(timedOut)
            : (run as (...a: unknown[]) => unknown)(
                query,
                ...rest,
              )) as typeof session.run;
        return session;
      };
      return driver;
    });
    let sampled;
    try {
      sampled = await new Neo4jSchemaManager().fetchSchema(auth());
    } finally {
      spy.mockRestore();
    }

    const node = sampled.nodeProperties as Props;
    // The sample is what ran: it cannot reach the last-created node.
    expect(node.Big.map((p) => p.name)).not.toContain("rareProp");
    expect(node.Big.map((p) => p.name)).toEqual(
      expect.arrayContaining(["name", "size"]),
    );
    // Same names and same type strings as the exact procedures, for every type.
    expect(sorted(node, "Typed")).toEqual(
      sorted(exact.nodeProperties as Props, "Typed"),
    );
    expect(sorted(sampled.relProperties as Props, "LINKS")).toEqual(
      sorted(exact.relProperties as Props, "LINKS"),
    );
    expect(sorted(node, "Typed")).toHaveLength(16);

    // Labels, types and patterns do not depend on the budget.
    expect(sampled.labels).toEqual(exact.labels);
    expect(sampled.relationshipTypes).toEqual(exact.relationshipTypes);
    expect(sampled.relationshipPatterns).toEqual(exact.relationshipPatterns);
  });
});
