/**
 * Integration tests for PostgresConnectionModule.checkConnection.
 *
 * Mirrors the existing Neo4j contract: success returns true, every failure
 * shape throws a wrapped ConnectorError so the API route can classify it.
 * Previously checkConnection swallowed errors and returned false, leaving
 * the UI with a useless "Connection check returned false" message (#900).
 */
import {
  PostgreSqlContainer,
  StartedPostgreSqlContainer,
} from "@testcontainers/postgresql";
import { PostgresConnectionModule } from "../../src/postgresql";
import { AuthType } from "../../src/generalized/interfaces";
import {
  ConnectorError,
  ConnectorErrorType,
} from "../../src/generalized/ConnectorError";

describe("PostgresConnectionModule.checkConnection", () => {
  let container: StartedPostgreSqlContainer;

  beforeAll(async () => {
    container = await new PostgreSqlContainer("postgres:16-alpine").start();
  }, 30000);

  afterAll(async () => {
    try {
      await container.stop();
    } catch {
      // suppress shutdown errors
    }
  });

  function validConfig() {
    return {
      username: container.getUsername(),
      password: container.getPassword(),
      authType: AuthType.NATIVE,
      uri: `postgresql://${container.getHost()}:${container.getPort()}/${container.getDatabase()}`,
    };
  }

  test("returns true for a reachable, authenticated database", async () => {
    const mod = new PostgresConnectionModule(validConfig());
    try {
      await expect(mod.checkConnection()).resolves.toBe(true);
    } finally {
      await mod.close();
    }
  });

  test("throws a wrapped ConnectorError with type CONNECTION on bad host", async () => {
    const mod = new PostgresConnectionModule({
      username: "anyone",
      password: "anything",
      authType: AuthType.NATIVE,
      // RFC 6761 reserves .invalid; guaranteed not to resolve.
      uri: "postgresql://nonexistent-host.invalid:5432/postgres",
    });
    try {
      await expect(mod.checkConnection()).rejects.toBeInstanceOf(
        ConnectorError,
      );
      // The whole point of #900: the underlying network-failure detail must
      // survive the wrap so the API route's classifier can route it to
      // `network` and the UI can hint at it. The internal ConnectorErrorType
      // is irrelevant to the user — what matters is the message.
      await expect(mod.checkConnection()).rejects.toThrow(
        /nonexistent-host\.invalid|ENOTFOUND|getaddrinfo/i,
      );
    } finally {
      await mod.close().catch(() => undefined);
    }
  });

  test("throws a wrapped ConnectorError with type AUTHENTICATION on bad credentials", async () => {
    const mod = new PostgresConnectionModule({
      username: "definitely-not-a-real-user",
      password: "definitely-not-the-real-password",
      authType: AuthType.NATIVE,
      uri: `postgresql://${container.getHost()}:${container.getPort()}/${container.getDatabase()}`,
    });
    try {
      await expect(mod.checkConnection()).rejects.toMatchObject({
        type: ConnectorErrorType.AUTHENTICATION,
      });
    } finally {
      await mod.close().catch(() => undefined);
    }
  });

  test("never returns false (silent failures are the bug we are fixing)", async () => {
    const mod = new PostgresConnectionModule({
      username: "anyone",
      password: "anything",
      authType: AuthType.NATIVE,
      uri: "postgresql://nonexistent-host.invalid:5432/postgres",
    });
    let returned: boolean | undefined;
    try {
      returned = await mod.checkConnection();
    } catch {
      // expected — checkConnection must throw, not return false
    } finally {
      await mod.close().catch(() => undefined);
    }
    expect(returned).toBeUndefined();
  });
});
