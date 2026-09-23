import { PostgresConnectionModule } from "../../src/postgresql/PostgresConnectionModule";
import {
  DEFAULT_CONNECTION_CONFIG,
  QueryStatus,
  AuthType,
  ConnectorError,
} from "@neoboard/connector-sdk";
import { PostgreSqlContainer } from "@testcontainers/postgresql";

describe("PostgreSQL Query Execution", () => {
  let container: PostgreSqlContainer;
  let connectionModule: PostgresConnectionModule;

  beforeAll(async () => {
    container = await new PostgreSqlContainer("postgres:16-alpine").start();

    connectionModule = new PostgresConnectionModule({
      username: container.getUsername(),
      password: container.getPassword(),
      authType: AuthType.NATIVE,
      uri: `postgresql://${container.getHost()}:${container.getPort()}/${container.getDatabase()}`,
    });

    // Authenticate before running tests
    const authenticated =
      await connectionModule.authModule.verifyAuthentication();
    expect(authenticated).toBe(true);

    // Create a test table
    const createTableQuery = `
      CREATE TABLE users (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        email VARCHAR(255) UNIQUE,
        age INT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `;

    const client = connectionModule.getPool()!.connect();
    try {
      await (await client).query(createTableQuery);

      // Insert test data
      await (
        await client
      ).query(`INSERT INTO users (name, email, age) VALUES ($1, $2, $3)`, [
        "Alice",
        "alice@example.com",
        30,
      ]);
      await (
        await client
      ).query(`INSERT INTO users (name, email, age) VALUES ($1, $2, $3)`, [
        "Bob",
        "bob@example.com",
        25,
      ]);
    } finally {
      (await client).release();
    }
  }, 60000);

  afterAll(async () => {
    // Close module first before stopping container
    if (connectionModule) {
      try {
        await connectionModule.close();
      } catch {
        // Suppress shutdown errors
      }
    }

    // Stop container
    try {
      await container.stop();
    } catch {
      // Suppress container shutdown errors
    }
  });

  test("should execute SELECT query", async () => {
    let result: any = null;
    let status: QueryStatus | null = null;
    let error: any = null;

    const config = {
      ...DEFAULT_CONNECTION_CONFIG,
    };

    await connectionModule.runQuery(
      { query: "SELECT * FROM users ORDER BY id ASC" },
      {
        onSuccess: (r) => (result = r),
        onFail: (e) => (error = e),
        setStatus: (s) => (status = s),
      },
      config,
    );

    expect(error).toBeNull();
    expect(status).toBe(QueryStatus.COMPLETE);
    expect(result).toBeDefined();
    // onSuccess receives a flat array of plain rows directly
    expect(result).toHaveLength(2);
    expect(result[0].name).toBe("Alice");
  });

  test("should execute query with parameters", async () => {
    let result: any = null;
    let status: QueryStatus | null = null;

    const config = {
      ...DEFAULT_CONNECTION_CONFIG,
    };

    await connectionModule.runQuery(
      {
        query: "SELECT * FROM users WHERE name = $param_name",
        params: { param_name: "Alice" }, // named, as the app sends them (#1898)
      },
      {
        onSuccess: (r) => (result = r),
        setStatus: (s) => (status = s),
      },
      config,
    );

    expect(status).toBe(QueryStatus.COMPLETE);
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe("Alice");
  });

  test("should return NO_DATA for empty result set", async () => {
    let status: QueryStatus | null = null;

    const config = {
      ...DEFAULT_CONNECTION_CONFIG,
    };

    await connectionModule.runQuery(
      { query: "SELECT * FROM users WHERE id = 9999" },
      {
        setStatus: (s) => (status = s),
      },
      config,
    );

    expect(status).toBe(QueryStatus.NO_DATA);
  });

  test("should return NO_QUERY for empty query", async () => {
    let status: QueryStatus | null = null;

    const config = {
      ...DEFAULT_CONNECTION_CONFIG,
    };

    await connectionModule.runQuery(
      { query: "" },
      {
        setStatus: (s) => (status = s),
      },
      config,
    );

    expect(status).toBe(QueryStatus.NO_QUERY);
  });

  test("should handle query errors", async () => {
    let status: QueryStatus | null = null;
    let error: any = null;

    const config = {
      ...DEFAULT_CONNECTION_CONFIG,
    };

    await connectionModule.runQuery(
      { query: "SELECT * FROM nonexistent_table" },
      {
        onFail: (e) => (error = e),
        setStatus: (s) => (status = s),
      },
      config,
    );

    expect(status).toBe(QueryStatus.ERROR);
    expect(error).toBeDefined();
  });

  test("should handle row limiting", async () => {
    let result: any = null;

    const config = {
      ...DEFAULT_CONNECTION_CONFIG,
      rowLimit: 1,
    };

    await connectionModule.runQuery(
      { query: "SELECT * FROM users" },
      {
        onSuccess: (r) => (result = r),
      },
      config,
    );

    // Even though we have 2 rows, with rowLimit=1, should get only 1
    expect(result).toHaveLength(1);
  });

  test("should check connection health", async () => {
    const config = {
      ...DEFAULT_CONNECTION_CONFIG,
    };

    const isHealthy = await connectionModule.checkConnection(config);
    expect(isHealthy).toBe(true);
  });

  test("should return flat records and COMPLETE status", async () => {
    let result: any = null;
    let status: QueryStatus | null = null;

    const config = {
      ...DEFAULT_CONNECTION_CONFIG,
    };

    await connectionModule.runQuery(
      { query: "SELECT * FROM users" },
      {
        onSuccess: (r) => (result = r),
        setStatus: (s) => (status = s),
      },
      config,
    );

    // onSuccess receives a flat array of plain rows — no summary wrapper
    expect(result).toBeDefined();
    expect(Array.isArray(result)).toBe(true);
    expect(status).toBe(QueryStatus.COMPLETE);
  });

  test("should execute read-only query with READ access mode", async () => {
    let result: any = null;
    let status: QueryStatus | null = null;

    const config = {
      ...DEFAULT_CONNECTION_CONFIG,
      accessMode: "READ",
    };

    await connectionModule.runQuery(
      { query: "SELECT * FROM users" },
      {
        onSuccess: (r) => (result = r),
        setStatus: (s) => (status = s),
      },
      config,
    );

    // onSuccess receives a flat array of plain rows — no summary wrapper
    expect(status).toBe(QueryStatus.COMPLETE);
    expect(result).toHaveLength(2);
  });

  test("should execute write query with WRITE access mode", async () => {
    let status: QueryStatus | null = null;

    const config = {
      ...DEFAULT_CONNECTION_CONFIG,
      accessMode: "WRITE",
    };

    await connectionModule.runQuery(
      {
        query:
          "INSERT INTO users (name, email, age) VALUES ($param_name, $param_email, $param_age)",
        params: {
          param_name: "Charlie",
          param_email: "charlie@example.com",
          param_age: 35,
        },
      },
      {
        setStatus: (s) => (status = s),
      },
      config,
    );

    // INSERT with affected rows → COMPLETE (rowCount from pg is 1, not 0)
    expect(status).toBe(QueryStatus.COMPLETE);
  });

  test("should handle timeout with proper status", async () => {
    let status: QueryStatus | null = null;
    let error: any = null;

    const config = {
      ...DEFAULT_CONNECTION_CONFIG,
      timeout: 1, // 1ms timeout to force timeout
    };

    await connectionModule.runQuery(
      { query: "SELECT pg_sleep(10)" }, // Sleep for 10 seconds
      {
        onFail: (e) => (error = e),
        setStatus: (s) => (status = s),
      },
      config,
    );

    expect(status).toBe(QueryStatus.TIMED_OUT);
    expect(error).toBeDefined();
  });

  test("should return plain row objects whose keys are the columns (#1904)", async () => {
    let result: any = null;

    const config = {
      ...DEFAULT_CONNECTION_CONFIG,
    };

    await connectionModule.runQuery(
      {
        query: "SELECT * FROM users WHERE name = $param_name",
        params: { param_name: "Alice" },
      },
      {
        onSuccess: (r) => (result = r),
      },
      config,
    );

    // onSuccess receives a flat array of plain rows. They used to be Proxies
    // with no ownKeys trap, so Object.keys(row) answered ["record"].
    expect(result).toBeDefined();
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe("Alice");
    expect(result[0].email).toBe("alice@example.com");
    expect(Object.keys(result[0])).toEqual(
      expect.arrayContaining(["name", "email"]),
    );
    expect(Object.getPrototypeOf(result[0])).toBe(Object.prototype);
  });

  test("should rollback transaction on error", async () => {
    let error: any = null;
    let status: QueryStatus | null = null;

    const config = {
      ...DEFAULT_CONNECTION_CONFIG,
      accessMode: "WRITE",
    };

    await connectionModule.runQuery(
      {
        query:
          "INSERT INTO users (name, email, age) VALUES ($param_name, $param_email, $param_age)",
        // Duplicate email should fail
        params: {
          param_name: "Dave",
          param_email: "alice@example.com",
          param_age: 40,
        },
      },
      {
        onFail: (e) => (error = e),
        setStatus: (s) => (status = s),
      },
      config,
    );

    expect(status).toBe(QueryStatus.ERROR);
    expect(error).toBeDefined();

    // Verify transaction was rolled back by checking user wasn't inserted
    let result: any = null;
    await connectionModule.runQuery(
      {
        query: "SELECT * FROM users WHERE name = $param_name",
        params: { param_name: "Dave" },
      },
      {
        onSuccess: (r) => (result = r),
      },
      {
        ...DEFAULT_CONNECTION_CONFIG,
      },
    );

    expect(result).toHaveLength(0);
  });

  // #1932: a blocked write is what PostgreSQL says it is (25006), never a
  // syntax error that happens to name a write keyword. That keyword pattern was
  // a true positive only while the preview wrapped queries in a SELECT (#1043).
  describe("what a failure means under READ access (#1932)", () => {
    async function failureOf(query: string) {
      let error: unknown = null;
      await connectionModule.runQuery(
        { query },
        { onFail: (e) => (error = e) },
        { ...DEFAULT_CONNECTION_CONFIG, accessMode: "READ" },
      );
      expect(error).toBeInstanceOf(ConnectorError);
      return error as ConnectorError;
    }

    test("a real write is a blocked write", async () => {
      const error = await failureOf("DELETE FROM users");

      expect(error.classification).toMatchObject({
        type: "READ_ONLY_VIOLATION",
        blockedWrite: true,
      });
    });

    test("a syntax error naming a write keyword is a syntax error", async () => {
      const error = await failureOf("SELECT create FROM users");

      expect(error.message).toMatch(/syntax error at or near "create"/);
      expect(error.classification.type).toBe("QUERY");
      expect(error.classification.blockedWrite).toBeFalsy();
    });
  });

  test("streams a huge READ result without buffering it all (MAX_ROWS+1)", async () => {
    let result: any = null;
    let status: QueryStatus | null = null;

    const config = {
      ...DEFAULT_CONNECTION_CONFIG,
      accessMode: "READ",
      rowLimit: 5,
    };

    // generate_series(1, 1_000_000) would materialise a million rows under the
    // old buffer-then-slice path. The cursor must pull only rowLimit + 1 (6)
    // and report truncation — proving memory stays bounded.
    await connectionModule.runQuery(
      { query: "SELECT g AS n FROM generate_series(1, 1000000) AS g" },
      {
        onSuccess: (r) => (result = r),
        setStatus: (s) => (status = s),
      },
      config,
    );

    expect(status).toBe(QueryStatus.COMPLETE_TRUNCATED);
    expect(result).toHaveLength(5);
    expect(result[0].n).toBe(1);
    expect(result[4].n).toBe(5);
  });

  test("should handle COMPLETE_TRUNCATED status when row limit exceeded", async () => {
    let status: QueryStatus | null = null;
    let result: any = null;

    const config = {
      ...DEFAULT_CONNECTION_CONFIG,
      rowLimit: 1,
    };

    // Insert more data to test truncation
    const client = await connectionModule.getPool()!.connect();
    try {
      await client.query(
        "INSERT INTO users (name, email, age) VALUES ($1, $2, $3)",
        ["Extra", "extra@example.com", 28],
      );
    } finally {
      client.release();
    }

    await connectionModule.runQuery(
      { query: "SELECT * FROM users" },
      {
        onSuccess: (r) => (result = r),
        setStatus: (s) => (status = s),
      },
      config,
    );

    expect(status).toBe(QueryStatus.COMPLETE_TRUNCATED);
    expect(result).toHaveLength(1);
  });

  // #1642: onSuccess used to run inside runQuery's try, so a consumer's own
  // exception was caught as a database failure — ROLLBACK on a committed
  // transaction, status ERROR, and onFail fired after onSuccess had already
  // fired. Before this was fixed, every assertion in this suite that lived
  // inside onSuccess only failed BECAUSE of that defect.
  test("a throwing onSuccess does not turn a successful query into a failure", async () => {
    let succeeded = false;
    const failures: unknown[] = [];
    const statuses: QueryStatus[] = [];
    const consumerBug = new Error("consumer handler blew up");

    await expect(
      connectionModule.runQuery(
        { query: "SELECT * FROM users" },
        {
          onSuccess: () => {
            succeeded = true;
            throw consumerBug;
          },
          onFail: (e) => failures.push(e),
          setStatus: (s) => statuses.push(s),
        },
        DEFAULT_CONNECTION_CONFIG,
      ),
    ).rejects.toBe(consumerBug);

    expect(succeeded).toBe(true);
    // Exactly one of onSuccess / onFail per call — and it was onSuccess.
    expect(failures).toHaveLength(0);
    // The query completed; the consumer's bug must not rewrite that.
    expect(statuses).toContain(QueryStatus.COMPLETE);
    expect(statuses).not.toContain(QueryStatus.ERROR);
    // The rejection is the consumer's own error, not a wrapped ConnectorError.
  });

  test("an empty query with a throwing onSuccess rejects the same way", async () => {
    // handleEmptyQuery delivers onSuccess([]) before any try block, so this
    // path already rejected before #1642; pinned so the two paths cannot drift.
    const failures: unknown[] = [];
    const consumerBug = new Error("consumer handler blew up on empty");

    await expect(
      connectionModule.runQuery(
        { query: "   " },
        {
          onSuccess: () => {
            throw consumerBug;
          },
          onFail: (e) => failures.push(e),
          setStatus: () => {},
        },
        DEFAULT_CONNECTION_CONFIG,
      ),
    ).rejects.toBe(consumerBug);
    expect(failures).toHaveLength(0);
  });
});
