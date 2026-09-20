import { ConnectorErrorType } from "@neoboard/connector-sdk";
import { classifyNeo4jError } from "../../src/neo4j/classify-error";
import { neo4jPlugin } from "../../src/neo4j/plugin";

const {
  AUTHENTICATION,
  BAD_URI,
  CONNECTION,
  CONSTRAINT,
  NETWORK,
  QUERY,
  TIMEOUT,
  UNKNOWN,
} = ConnectorErrorType;

/** A Neo4jError as the driver throws it: an Error with the server's `code`. */
const neo4jError = (message: string, code?: string) =>
  Object.assign(new Error(message), code ? { code } : {});

const TX_TIMEOUT =
  "The transaction has been terminated. Retry your operation in a new transaction, and you should see a successful result. The transaction has not completed within the specified timeout (dbms.transaction.timeout).";

describe("classifyNeo4jError", () => {
  it("is the plugin's classifyError hook", () => {
    expect(neo4jPlugin.classifyError).toBe(classifyNeo4jError);
  });

  describe("server codes are authoritative", () => {
    it.each([
      ["Neo.ClientError.Security.Unauthorized", AUTHENTICATION],
      ["Neo.ClientError.Security.AuthenticationRateLimit", AUTHENTICATION],
      ["Neo.ClientError.Transaction.TransactionTimedOut", TIMEOUT],
      [
        "Neo.ClientError.Transaction.TransactionTimedOutClientConfiguration",
        TIMEOUT,
      ],
      ["Neo.ClientError.Statement.SyntaxError", QUERY],
      ["Neo.ClientError.Statement.ParameterMissing", QUERY],
      ["ServiceUnavailable", CONNECTION],
    ])("%s is %s, whatever the message says", (code, type) => {
      expect(classifyNeo4jError(neo4jError("x", code)).type).toBe(type);
    });

    it("reports a broken constraint it cannot name more precisely", () => {
      expect(
        classifyNeo4jError(
          neo4jError(
            "Node(1) already exists with label `Person` and property `id` = 7",
            "Neo.ClientError.Schema.ConstraintValidationFailed",
          ),
        ),
      ).toEqual({
        type: CONSTRAINT,
        transient: false,
        constraint: { kind: "other" },
      });
    });

    // #1898: the message says "timeout", and the keyword lists used to believe it.
    it("does not read a missing $param_timeout as a timeout", () => {
      expect(
        classifyNeo4jError(
          neo4jError(
            "Expected parameter(s): param_timeout",
            "Neo.ClientError.Statement.ParameterMissing",
          ),
        ),
      ).toEqual({ type: QUERY, transient: false });
    });

    it("keeps a transaction timeout transient although it is a ClientError", () => {
      expect(
        classifyNeo4jError(
          neo4jError(
            TX_TIMEOUT,
            "Neo.ClientError.Transaction.TransactionTimedOutClientConfiguration",
          ),
        ),
      ).toEqual({ type: TIMEOUT, transient: true });
    });
  });

  describe("authentication", () => {
    it.each([
      "authentication failure",
      "AuthenticationRateLimit",
      "The client is unauthorized due to authentication failure.",
      "Unauthorized: invalid credentials",
    ])("%j", (message) => {
      expect(classifyNeo4jError(neo4jError(message))).toEqual({
        type: AUTHENTICATION,
        transient: false,
      });
    });

    it("beats a network phrase in the same message", () => {
      expect(
        classifyNeo4jError(
          neo4jError(
            "authentication failure: ECONNREFUSED while reading server greeting",
          ),
        ).type,
      ).toBe(AUTHENTICATION);
    });
  });

  describe("network — nothing answered", () => {
    it.each([
      "connect ECONNREFUSED 127.0.0.1:7687",
      "getaddrinfo ENOTFOUND db.example.com",
      "connect ETIMEDOUT",
      "Network is unreachable",
      // Routing discovery, with the driver's code repeated in the message.
      "ServiceUnavailable: Could not perform discovery. No routing servers available.",
      "Could not perform discovery. No routing servers available.",
      "WebSocket connection failure",
      // The channel on connectionTimeout — it names no network code (#1678).
      "Failed to connect to server. Please ensure that your database is listening on the correct host and port and that you have compatible encryption settings both on Neo4j server and driver. Note that the default encryption setting has changed in Neo4j 4.0. Caused by: Failed to establish connection in 30000ms",
      "Failed to establish connection in 30000ms",
    ])("%j", (message) => {
      expect(classifyNeo4jError(neo4jError(message)).type).toBe(NETWORK);
    });

    it("wins over the driver's ServiceUnavailable code when the message says why", () => {
      expect(
        classifyNeo4jError(
          neo4jError(
            "Could not perform discovery. No routing servers available.",
            "ServiceUnavailable",
          ),
        ).type,
      ).toBe(NETWORK);
    });

    it.each([
      // A query the database cut short, and a busy pool: the host is alive.
      [TX_TIMEOUT, TIMEOUT],
      [
        "Connection acquisition timed out in 60000 ms. Pool status: Active conn count = 100, Idle conn count = 0.",
        QUERY,
      ],
    ])("%j is not a dead host", (message, type) => {
      expect(classifyNeo4jError(neo4jError(message))).toEqual({
        type,
        transient: true,
      });
    });
  });

  describe("bad URI", () => {
    it.each([
      "Invalid URI scheme: 'http'",
      "Could not parse URI",
      "Unknown scheme: neo5j",
      "URI malformed",
    ])("%j", (message) => {
      expect(classifyNeo4jError(neo4jError(message)).type).toBe(BAD_URI);
    });

    it("beats a network phrase in the same message", () => {
      expect(
        classifyNeo4jError(
          neo4jError(
            "Invalid URI scheme: 'http' (ETIMEDOUT trying to connect)",
          ),
        ).type,
      ).toBe(BAD_URI);
    });
  });

  describe("transient vs permanent", () => {
    it.each([
      "The transaction has been terminated. timed out",
      "connection acquisition timeout",
      "Query timeout exceeded (5000ms)",
      "read ECONNRESET",
      "socket hang up",
    ])("%j is transient", (message) => {
      expect(classifyNeo4jError(neo4jError(message)).transient).toBe(true);
    });

    it.each([
      "Invalid input '*': expected an identifier",
      // Permanent beats transient: a retry fails the same way.
      "Invalid input 'timeout': expected an identifier",
      "connect ECONNREFUSED 127.0.0.1:7687",
      "Cannot read properties of undefined",
    ])("%j is permanent", (message) => {
      expect(classifyNeo4jError(neo4jError(message)).transient).toBe(false);
    });
  });

  describe("blocked write", () => {
    it.each([
      "Writing in read access mode not allowed. Attempted write to neo4j",
      "Write operations are not allowed for user 'reader' with roles [reader].",
    ])("%j", (message) => {
      expect(
        classifyNeo4jError(
          neo4jError(message, "Neo.ClientError.Statement.AccessMode"),
        ),
      ).toEqual({ type: QUERY, transient: false, blockedWrite: true });
    });

    it("is not set for any other statement error", () => {
      expect(
        classifyNeo4jError(
          neo4jError("Invalid input", "Neo.ClientError.Statement.SyntaxError"),
        ).blockedWrite,
      ).toBeUndefined();
    });
  });

  it("falls back to QUERY for an error it does not recognise, UNKNOWN for a non-object", () => {
    expect(classifyNeo4jError(neo4jError("Something else"))).toEqual({
      type: QUERY,
      transient: false,
    });
    expect(classifyNeo4jError(null).type).toBe(UNKNOWN);
    expect(classifyNeo4jError("string").type).toBe(UNKNOWN);
  });
});
