import { ConnectorErrorType } from "@neoboard/connector-sdk";
import { classifyPostgresError } from "../../src/postgresql/classify-error";
import { postgresPlugin } from "../../src/postgresql/plugin";

const {
  AUTHENTICATION,
  BAD_URI,
  CONNECTION,
  CONSTRAINT,
  NETWORK,
  QUERY,
  READ_ONLY_VIOLATION,
  TIMEOUT,
  UNKNOWN,
} = ConnectorErrorType;

/** A pg DatabaseError as the driver throws it: an Error with SQLSTATE and friends. */
const pgError = (message: string, fields: Record<string, string> = {}) =>
  Object.assign(new Error(message), fields);

describe("classifyPostgresError", () => {
  it("is the plugin's classifyError hook", () => {
    expect(postgresPlugin.classifyError).toBe(classifyPostgresError);
  });

  describe("SQLSTATE is authoritative", () => {
    it.each([
      ["57014", TIMEOUT, true],
      ["57P01", TIMEOUT, false],
      ["28P01", AUTHENTICATION, false],
      ["28000", AUTHENTICATION, false],
      ["28001", AUTHENTICATION, false],
      // The database does not exist: credentials can be fine (#974).
      ["3D000", CONNECTION, false],
      ["08001", CONNECTION, false],
      ["08003", CONNECTION, false],
      ["08006", CONNECTION, false],
      ["25006", READ_ONLY_VIOLATION, false],
      ["42601", QUERY, false],
      ["42P01", QUERY, false],
      ["42703", QUERY, false],
      ["XX999", QUERY, false],
    ])("%s is %s (transient: %s)", (code, type, transient) => {
      const message =
        code === "57014" ? "canceling statement due to statement timeout" : "x";
      expect(classifyPostgresError(pgError(message, { code }))).toMatchObject({
        type,
        transient,
      });
    });

    // The old detector read the message first, so this was a TIMEOUT.
    it('types `column "timeout" does not exist` by its SQLSTATE, not by its words', () => {
      expect(
        classifyPostgresError(
          pgError('column "timeout" does not exist', { code: "42703" }),
        ),
      ).toEqual({ type: QUERY, transient: false });
    });
  });

  describe("constraints — which rule a write broke", () => {
    it.each([
      ["23502", "not_null"],
      ["23505", "unique"],
      ["23503", "foreign_key"],
      ["23514", "check"],
      ["23P01", "exclusion"],
      ["22P02", "invalid_format"],
      ["22003", "out_of_range"],
      ["22001", "too_long"],
      ["22007", "invalid_datetime"],
      ["22008", "invalid_datetime"],
    ])("%s is %s", (code, kind) => {
      expect(classifyPostgresError(pgError("x", { code }))).toEqual({
        type: CONSTRAINT,
        transient: false,
        constraint: { kind },
      });
    });

    it("names the column and the constraint — and nothing else the driver said", () => {
      const classification = classifyPostgresError(
        pgError('null value in column "rating" of relation "feedback"', {
          code: "23502",
          column: "rating",
          constraint: "feedback_rating_not_null",
          table: "feedback",
          detail: "Failing row contains (12, null, hunter2).",
        }),
      );
      expect(classification).toEqual({
        type: CONSTRAINT,
        transient: false,
        constraint: {
          kind: "not_null",
          column: "rating",
          name: "feedback_rating_not_null",
        },
      });
      expect(JSON.stringify(classification)).not.toMatch(/hunter2|Failing/);
    });
  });

  describe("authentication", () => {
    it.each([
      'password authentication failed for user "bob"',
      "password authentication failed for user",
    ])("%j", (message) => {
      expect(classifyPostgresError(pgError(message))).toEqual({
        type: AUTHENTICATION,
        transient: false,
      });
    });
  });

  describe("network — nothing answered", () => {
    it.each([
      "connect ECONNREFUSED 127.0.0.1:5432",
      "getaddrinfo ENOTFOUND db.example.com",
      "connect ETIMEDOUT 10.0.0.1:5432",
      "Network is unreachable",
      // None of these names a network code (#1678):
      // pg-pool >= 3.14 wrapping the client's connect timeout,
      "Connection terminated due to connection timeout",
      // pg-pool with every client busy,
      "timeout exceeded when trying to connect",
      // and pg.Client's connectionTimeoutMillis without a pool.
      "timeout expired",
    ])("%j", (message) => {
      expect(classifyPostgresError(pgError(message)).type).toBe(NETWORK);
    });

    it.each([
      // A query the database cut short, and a backend that died mid-query:
      // the host is alive.
      ["canceling statement due to statement timeout", TIMEOUT],
      ["Connection terminated unexpectedly", CONNECTION],
    ])("%j is not a dead host, and is worth a retry", (message, type) => {
      expect(classifyPostgresError(pgError(message))).toEqual({
        type,
        transient: true,
      });
    });
  });

  describe("bad URI", () => {
    it.each([
      "Invalid URI scheme: 'http'",
      "Could not parse URI",
      "Invalid connection URI: missing host",
      "URI malformed",
    ])("%j", (message) => {
      expect(classifyPostgresError(pgError(message)).type).toBe(BAD_URI);
    });

    it("beats a network phrase in the same message", () => {
      expect(
        classifyPostgresError(
          pgError("Invalid URI scheme: 'http' (ETIMEDOUT trying to connect)"),
        ).type,
      ).toBe(BAD_URI);
    });
  });

  describe("transient vs permanent", () => {
    it.each([
      "canceling statement due to statement timeout",
      "STATEMENT TIMEOUT exceeded",
      "Query timeout exceeded (5000ms)",
      "Connection terminated unexpectedly",
      "server closed the connection unexpectedly",
      "read ECONNRESET",
      "write EPIPE: broken pipe",
    ])("%j is transient", (message) => {
      expect(classifyPostgresError(pgError(message)).transient).toBe(true);
    });

    it.each([
      'syntax error at or near "FROM"',
      'relation "users" does not exist',
      "permission denied for table users",
      "password authentication failed for user",
      "invalid input syntax for type integer",
      "connect ECONNREFUSED 127.0.0.1:5432",
      // Permanent beats transient: a retry fails the same way.
      'syntax error at "timeout" near line 3',
    ])("%j is permanent", (message) => {
      expect(classifyPostgresError(pgError(message)).transient).toBe(false);
    });

    it("a statement's own fault is never a timeout, even without its SQLSTATE", () => {
      expect(
        classifyPostgresError(pgError('syntax error at "timeout" near line 3')),
      ).toEqual({ type: QUERY, transient: false });
      // #1898, should the message ever arrive unwrapped.
      expect(
        classifyPostgresError(pgError("Expected parameter(s): param_timeout")),
      ).toEqual({ type: QUERY, transient: false });
    });
  });

  describe("blocked write", () => {
    it("a write inside a READ ONLY transaction", () => {
      expect(
        classifyPostgresError(
          pgError("cannot execute DELETE in a read-only transaction", {
            code: "25006",
          }),
        ),
      ).toEqual({
        type: READ_ONLY_VIOLATION,
        transient: false,
        blockedWrite: true,
      });
    });

    it.each(["read-only transaction", "cannot execute INSERT"])(
      "by the phrase %j when the SQLSTATE is missing",
      (message) => {
        expect(classifyPostgresError(pgError(message)).blockedWrite).toBe(true);
      },
    );

    // #1932: this used to be a blocked write. The signature was written for
    // #1043, when the preview wrapped a query as `SELECT * FROM (<query>)` and
    // a wrapped DELETE really did fail at "DELETE". #1896 removed the wrapper:
    // a real write now reaches PostgreSQL untouched and fails as 25006, caught
    // above. What still fails at a write keyword is a genuine syntax error —
    // `SELECT create FROM movies` — and the user was sent to build a Form.
    it.each([
      "INSERT",
      "UPDATE",
      "DELETE",
      "MERGE",
      "CREATE",
      "DROP",
      "ALTER",
      "TRUNCATE",
      "SET",
      "REMOVE",
      "create",
    ])(
      "a syntax error at or near the write keyword %s is a syntax error, not a blocked write (#1932)",
      (keyword) => {
        expect(
          classifyPostgresError(
            pgError(`syntax error at or near "${keyword}"`, { code: "42601" }),
          ),
        ).toEqual({ type: QUERY, transient: false });
      },
    );

    it.each(['syntax error at or near "FROMM"', 'column "foo" does not exist'])(
      "not %j",
      (message) => {
        expect(
          classifyPostgresError(pgError(message)).blockedWrite,
        ).toBeUndefined();
      },
    );
  });

  it("falls back to QUERY for an error it does not recognise, UNKNOWN for a non-object", () => {
    expect(classifyPostgresError(pgError("boom"))).toEqual({
      type: QUERY,
      transient: false,
    });
    expect(classifyPostgresError(null).type).toBe(UNKNOWN);
    expect(classifyPostgresError("string").type).toBe(UNKNOWN);
  });
});
