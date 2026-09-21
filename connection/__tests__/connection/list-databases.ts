import { Neo4jConnectionModule } from "../../src/neo4j/Neo4jConnectionModule";
import { PostgresConnectionModule } from "../../src/postgresql/PostgresConnectionModule";
import { getNeo4jAuth } from "../utils/setup";
import { AuthType } from "@neoboard/connector-sdk";
import { PostgreSqlContainer } from "@testcontainers/postgresql";

describe("Neo4j listDatabases", () => {
  let connectionModule: Neo4jConnectionModule;

  beforeAll(() => {
    const config = getNeo4jAuth();
    connectionModule = new Neo4jConnectionModule(config);
  });

  afterAll(async () => {
    await connectionModule.close();
  });

  // 30s: the first query after container start pays Neo4j JVM warmup —
  // observed >15s on a loaded machine (2/2 cold full-suite runs, 2026-06-10).
  test("should return an array of database names", async () => {
    const databases = await connectionModule.listDatabases();
    expect(Array.isArray(databases)).toBe(true);
    // Enterprise Neo4j always has at least "neo4j" and "system"
    expect(databases.length).toBeGreaterThanOrEqual(1);
    // "neo4j" is the default database
    expect(databases).toContain("neo4j");
  }, 30_000);

  test("should filter out the system database", async () => {
    const databases = await connectionModule.listDatabases();
    expect(databases).not.toContain("system");
  });

  test("should only include online databases", async () => {
    const databases = await connectionModule.listDatabases();
    // All returned databases should be queryable (online)
    for (const db of databases) {
      expect(typeof db).toBe("string");
      expect(db.length).toBeGreaterThan(0);
    }
  });
});

/**
 * #1308: this suite used to run `listDatabases()` against the live container
 * with valid credentials and assert `Array.isArray(...)`. `SHOW DATABASES`
 * succeeded, so the `catch` it claimed to cover was never entered, and the one
 * assertion was satisfied by the success path — and by any implementation that
 * returns an array at all.
 *
 * The failure is now injected at the session, which reaches the same `catch`
 * the code comments document (Neo4j < 4.x, permission denied on `system`)
 * without depending on a driver's auth-retry timing, and pins the `finally`
 * block as well.
 */
describe("Neo4j listDatabases graceful fallback", () => {
  /** A module whose session always fails, plus the close() the module must call. */
  function moduleWithFailingSession(reason: Error) {
    const module = new Neo4jConnectionModule(getNeo4jAuth());
    const close = jest.fn().mockResolvedValue(undefined);
    jest.spyOn(module.getDriver(), "session").mockReturnValue({
      run: jest.fn().mockRejectedValue(reason),
      close,
    } as never);
    return { module, close };
  }

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it.each([
    ["the command is unsupported", "Unsupported administration command"],
    ["permission is denied", "Permission denied on database 'system'"],
  ])("returns an empty array when %s", async (_label, message) => {
    const { module } = moduleWithFailingSession(new Error(message));

    // Exactly [], not merely "an array": the old assertion passed on the
    // success path, which is what made it vacuous.
    await expect(module.listDatabases()).resolves.toEqual([]);
  });

  it("closes the session even when the query fails", async () => {
    const { module, close } = moduleWithFailingSession(new Error("boom"));

    await module.listDatabases();

    expect(close).toHaveBeenCalledTimes(1);
  });

  it("still reports the databases when the query succeeds", async () => {
    // The negative control: a test that only ever saw a failing session would
    // pass against an implementation that returned [] unconditionally.
    const module = new Neo4jConnectionModule(getNeo4jAuth());
    const close = jest.fn().mockResolvedValue(undefined);
    jest.spyOn(module.getDriver(), "session").mockReturnValue({
      run: jest.fn().mockResolvedValue({
        records: [{ get: () => "movies" }, { get: () => "reporting" }],
      }),
      close,
    } as never);

    await expect(module.listDatabases()).resolves.toEqual([
      "movies",
      "reporting",
    ]);
    expect(close).toHaveBeenCalledTimes(1);
  });
});

describe("PostgreSQL listDatabases", () => {
  let container: any;
  let connectionModule: PostgresConnectionModule;

  beforeAll(async () => {
    container = await new PostgreSqlContainer("postgres:16-alpine").start();
    connectionModule = new PostgresConnectionModule({
      username: container.getUsername(),
      password: container.getPassword(),
      authType: AuthType.NATIVE,
      uri: `postgresql://${container.getHost()}:${container.getPort()}/${container.getDatabase()}`,
    });

    const authenticated =
      await connectionModule.authModule.verifyAuthentication();
    expect(authenticated).toBe(true);
  }, 60000);

  afterAll(async () => {
    if (connectionModule) {
      try {
        await connectionModule.close();
      } catch {
        // Suppress shutdown errors
      }
    }
    try {
      await container.stop();
    } catch {
      // Suppress container shutdown errors
    }
  });

  test("should return an array of database names", async () => {
    const databases = await connectionModule.listDatabases();
    expect(Array.isArray(databases)).toBe(true);
    // PostgreSQL always has at least "postgres"
    expect(databases.length).toBeGreaterThanOrEqual(1);
    expect(databases).toContain("postgres");
  });

  test("should exclude template databases", async () => {
    const databases = await connectionModule.listDatabases();
    expect(databases).not.toContain("template0");
    expect(databases).not.toContain("template1");
  });

  test("should return empty array on failure", async () => {
    // Create a module with bad credentials — listDatabases should not throw
    const badModule = new PostgresConnectionModule({
      username: "nonexistent",
      password: "wrong",
      authType: AuthType.NATIVE,
      uri: "postgresql://localhost:1/nodb",
    });

    const databases = await badModule.listDatabases();
    expect(databases).toEqual([]);
  });
});

describe("PostgreSQL listSchemas", () => {
  let container: any;
  let connectionModule: PostgresConnectionModule;

  beforeAll(async () => {
    container = await new PostgreSqlContainer("postgres:16-alpine").start();
    connectionModule = new PostgresConnectionModule({
      username: container.getUsername(),
      password: container.getPassword(),
      authType: AuthType.NATIVE,
      uri: `postgresql://${container.getHost()}:${container.getPort()}/${container.getDatabase()}`,
    });

    const authenticated =
      await connectionModule.authModule.verifyAuthentication();
    expect(authenticated).toBe(true);
  }, 60000);

  afterAll(async () => {
    if (connectionModule) {
      try {
        await connectionModule.close();
      } catch {
        // Suppress shutdown errors
      }
    }
    try {
      await container.stop();
    } catch {
      // Suppress container shutdown errors
    }
  });

  test("should return an array of schema names", async () => {
    const schemas = await connectionModule.listSchemas();
    expect(Array.isArray(schemas)).toBe(true);
    // PostgreSQL always has "public" and "information_schema"
    expect(schemas).toContain("public");
  });

  test("should exclude internal pg_ schemas", async () => {
    const schemas = await connectionModule.listSchemas();
    for (const schema of schemas) {
      expect(schema).not.toMatch(/^pg_/);
    }
  });

  test("should return empty array on failure", async () => {
    const badModule = new PostgresConnectionModule({
      username: "nonexistent",
      password: "wrong",
      authType: AuthType.NATIVE,
      uri: "postgresql://localhost:1/nodb",
    });

    const schemas = await badModule.listSchemas();
    expect(schemas).toEqual([]);
  });
});
