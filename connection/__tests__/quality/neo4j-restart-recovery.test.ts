/**
 * Coverage gap from #742 (item 8) — connection recovery after a Neo4j
 * restart. Uses its OWN container (restarting the shared one would break
 * every parallel suite) with a FIXED host port: testcontainers remaps the
 * published port on restart, but production databases keep their address
 * across a bounce — the fixed binding replicates that.
 */
import { Neo4jContainer } from "@testcontainers/neo4j";
import type { StartedNeo4jContainer } from "@testcontainers/neo4j";
import neo4j from "neo4j-driver";
import { createServer, type AddressInfo } from "node:net";
import { Neo4jConnectionModule } from "../../src/neo4j/Neo4jConnectionModule";
import { AuthType, DEFAULT_CONNECTION_CONFIG } from "@neoboard/connector-sdk";

// Two Neo4j boots — give it plenty of room.
jest.setTimeout(300_000);

let container: StartedNeo4jContainer;
let connection: Neo4jConnectionModule;

const READ_CONFIG = {
  ...DEFAULT_CONNECTION_CONFIG,
  timeout: 20_000,
};

async function runRead(query: string) {
  let rows: unknown[] | null = null;
  let failure: unknown = null;
  await connection.runQuery(
    { query, params: {} },
    {
      onSuccess: (r: unknown[]) => (rows = r),
      onFail: (e: unknown) => (failure = e),
    },
    READ_CONFIG,
  );
  return { rows, failure };
}

/** Poll bolt until a trivial query succeeds (post-restart warmup). */
async function waitForBolt(uri: string, password: string, timeoutMs: number) {
  const deadline = Date.now() + timeoutMs;
  let lastErr: unknown;
  while (Date.now() < deadline) {
    const driver = neo4j.driver(uri, neo4j.auth.basic("neo4j", password));
    try {
      const session = driver.session();
      await session.run("RETURN 1");
      await session.close();
      await driver.close();
      return;
    } catch (e) {
      lastErr = e;
      await driver.close().catch(() => {});
      await new Promise((r) => setTimeout(r, 1000));
    }
  }
  throw lastErr;
}

/**
 * A host port nothing holds now, fixed for this run. A constant made two runs
 * at once (two checkouts) both claim it: "port is already allocated" (#1929).
 */
function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.once("error", reject);
    server.listen(0, () => {
      const { port } = server.address() as AddressInfo;
      server.close(() => resolve(port));
    });
  });
}

let boltPort: number;

beforeAll(async () => {
  boltPort = await freePort();
  container = await new Neo4jContainer("neo4j:5-community")
    .withPassword("recovery-test-pw")
    .withExposedPorts({ container: 7687, host: boltPort }, 7474)
    .start();
  connection = new Neo4jConnectionModule({
    uri: `bolt://localhost:${boltPort}`,
    username: container.getUsername(),
    password: container.getPassword(),
    authType: AuthType.NATIVE,
  });
});

afterAll(async () => {
  await connection?.getDriver().close();
  await container?.stop();
});

describe("Neo4j connection recovery after restart (#742 item 8)", () => {
  it("the same module keeps working across a database restart", async () => {
    // Healthy before.
    const before = await runRead("RETURN 1 AS one");
    expect(before.failure).toBeNull();
    expect(before.rows).toHaveLength(1);

    // Bounce the database out from under the driver.
    await container.restart();
    await waitForBolt(container.getBoltUri(), container.getPassword(), 120_000);

    // The driver may surface one transient failure while its pooled
    // connections are discovered dead — recovery means a retry succeeds
    // without rebuilding the module.
    let recovered = await runRead("RETURN 2 AS two");
    if (recovered.failure) {
      recovered = await runRead("RETURN 2 AS two");
    }
    expect(recovered.failure).toBeNull();
    expect(recovered.rows).toHaveLength(1);
  });
});
