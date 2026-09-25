import { Neo4jAuthenticationModule } from "../../src/neo4j/Neo4jAuthenticationModule";
import { AuthType } from "@neoboard/connector-sdk";
import { getNeo4jAuth } from "../utils/setup";

describe("Neo4jAuthenticationModule creation to check consistency", () => {
  // The config bag carries no authType — it is not a descriptor field, and
  // the app never stores one — so an absent authType means NATIVE (#1897).
  test("creating an authenticationModule with nothing as config", () => {
    // Expect a raised exception
    expect(() => new Neo4jAuthenticationModule({})).toThrow("URI is required");
  });
  test("creating an authenticationModule with no authType", () => {
    // Expect a raised exception
    expect(() => new Neo4jAuthenticationModule({ uri: "test" })).toThrow(
      "Invalid URI format",
    );
  });
  test("creating an authenticationModule with an AuthType.Empty authType", () => {
    // Expect a raised exception
    expect(
      () => new Neo4jAuthenticationModule({ authType: AuthType.EMPTY }),
    ).toThrow(
      "Authentication type is Empty. Please provide a username and password",
    );
  });
  test("creating an authenticationModule with an empty URI", () => {
    // Expect a raised exception
    expect(
      () => new Neo4jAuthenticationModule({ authType: AuthType.NATIVE }),
    ).toThrow("URI is required");
  });
  test("creating an authenticationModule with undefined config", () => {
    // Expect a raised exception
    // @ts-expect-error the negative case: no config at all
    expect(() => new Neo4jAuthenticationModule(undefined)).toThrow(
      "Connection config is required",
    );
  });
  test("creating an authenticationModule with an undefined AuthType", () => {
    // Expect a raised exception
    expect(
      () => new Neo4jAuthenticationModule({ authType: undefined }),
    ).toThrow("Authentication type is required");
  });
});

describe("Neo4jAuthenticationModule with native auth", () => {
  test("creating an authenticationModule with native auth", async () => {
    const config = getNeo4jAuth();
    const authModule = new Neo4jAuthenticationModule(config);
    const isAuthenticated = await authModule.verifyAuthentication();
    expect(isAuthenticated).toBe(true);
  });

  test("creating an authenticationModule with native auth, but wrong password", async () => {
    const config = getNeo4jAuth();
    config.password = "wrongpassword";
    const authModule = new Neo4jAuthenticationModule(config);
    const isAuthenticated = await authModule.verifyAuthentication();
    expect(isAuthenticated).toBe(false);
  });

  test("creating an authenticationModule with native auth, but wrong URI throws", async () => {
    const config = getNeo4jAuth();
    // Use RFC 5737 TEST-NET-1 (non-routable) to guarantee a connection failure.
    // 'localhosta' can resolve to localhost on some systems (macOS mDNS),
    // causing the driver to connect to a local Neo4j instance instead of failing.
    config.uri = "bolt://192.0.2.1:7687";
    const authModule = new Neo4jAuthenticationModule({
      ...config,
      connectionTimeout: 2000,
    });
    await expect(authModule.verifyAuthentication()).rejects.toThrow();
  });

  test("creating an authenticationModule with wrong username", async () => {
    const config = getNeo4jAuth();
    config.username = "wronguser";
    const authModule = new Neo4jAuthenticationModule(config);
    const isAuthenticated = await authModule.verifyAuthentication();
    expect(isAuthenticated).toBe(false);
  });

  test("creating an authenticationModule with wrong username and after fail connection Update authConfig", async () => {
    const wrongConfig = getNeo4jAuth();
    wrongConfig.username = "wronguser";
    const authModule = new Neo4jAuthenticationModule(wrongConfig);
    const isNotAuthenticated = await authModule.verifyAuthentication();
    expect(isNotAuthenticated).toBe(false);
    const config = getNeo4jAuth();
    await authModule.updateAuthConfig(config);
    const isAuthenticated = await authModule.verifyAuthentication();
    expect(isAuthenticated).toBe(true);
  });
});
