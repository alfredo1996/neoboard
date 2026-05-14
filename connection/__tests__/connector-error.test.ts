import {
  ConnectorError,
  ConnectorErrorType,
  detectNeo4jErrorType,
  detectPostgresErrorType,
  wrapError,
} from "../src/generalized/ConnectorError";

describe("ConnectorError", () => {
  it("creates an error with type and original", () => {
    const original = new Error("timeout");
    const err = new ConnectorError(
      "query timed out",
      ConnectorErrorType.TIMEOUT,
      original,
    );
    expect(err.message).toBe("query timed out");
    expect(err.type).toBe(ConnectorErrorType.TIMEOUT);
    expect(err.originalError).toBe(original);
    expect(err.name).toBe("ConnectorError");
    expect(err instanceof Error).toBe(true);
  });

  it("defaults to UNKNOWN type", () => {
    const err = new ConnectorError("something");
    expect(err.type).toBe(ConnectorErrorType.UNKNOWN);
  });
});

describe("detectNeo4jErrorType", () => {
  it("detects ServiceUnavailable as CONNECTION", () => {
    expect(
      detectNeo4jErrorType({ code: "ServiceUnavailable", message: "" }),
    ).toBe(ConnectorErrorType.CONNECTION);
  });

  it("detects authentication errors", () => {
    expect(
      detectNeo4jErrorType({ code: "Neo.ClientError.Security.Unauthorized" }),
    ).toBe(ConnectorErrorType.AUTHENTICATION);
  });

  it("detects timeout from transaction terminated message", () => {
    expect(
      detectNeo4jErrorType({
        message: "The transaction has been terminated. Retry your query",
      }),
    ).toBe(ConnectorErrorType.TIMEOUT);
  });

  it("falls back to QUERY for other errors", () => {
    expect(detectNeo4jErrorType({ message: "syntax error" })).toBe(
      ConnectorErrorType.QUERY,
    );
  });

  it("returns UNKNOWN for non-objects", () => {
    expect(detectNeo4jErrorType(null)).toBe(ConnectorErrorType.UNKNOWN);
    expect(detectNeo4jErrorType("string")).toBe(ConnectorErrorType.UNKNOWN);
  });
});

describe("detectPostgresErrorType", () => {
  it("detects timeout from error code 57014", () => {
    expect(detectPostgresErrorType({ code: "57014" })).toBe(
      ConnectorErrorType.TIMEOUT,
    );
  });

  it("detects authentication from code 28P01", () => {
    expect(detectPostgresErrorType({ code: "28P01" })).toBe(
      ConnectorErrorType.AUTHENTICATION,
    );
  });

  it("detects 3D000 (invalid database) as CONNECTION", () => {
    expect(detectPostgresErrorType({ code: "3D000" })).toBe(
      ConnectorErrorType.CONNECTION,
    );
  });

  it("detects connection error from code 08001", () => {
    expect(detectPostgresErrorType({ code: "08001" })).toBe(
      ConnectorErrorType.CONNECTION,
    );
  });

  it("detects read-only violation", () => {
    expect(detectPostgresErrorType({ code: "25006" })).toBe(
      ConnectorErrorType.READ_ONLY_VIOLATION,
    );
  });

  it("falls back to QUERY for other codes", () => {
    expect(
      detectPostgresErrorType({ code: "42601", message: "syntax error" }),
    ).toBe(ConnectorErrorType.QUERY);
  });
});

describe("wrapError", () => {
  it("wraps Neo4j error correctly", () => {
    const raw = { code: "ServiceUnavailable", message: "Failed to connect" };
    const wrapped = wrapError(raw, "neo4j");
    expect(wrapped).toBeInstanceOf(ConnectorError);
    expect(wrapped.type).toBe(ConnectorErrorType.CONNECTION);
    expect(wrapped.originalError).toBe(raw);
  });

  it("wraps PostgreSQL error correctly", () => {
    const raw = new Error("canceling statement due to statement timeout");
    (raw as unknown as { code: string }).code = "57014";
    const wrapped = wrapError(raw, "postgresql");
    expect(wrapped.type).toBe(ConnectorErrorType.TIMEOUT);
  });

  it("sanitizes PostgreSQL auth error — does not leak username", () => {
    const raw = new Error(
      'FATAL: password authentication failed for user "admin"',
    );
    (raw as unknown as { code: string }).code = "28P01";
    const wrapped = wrapError(raw, "postgresql");
    expect(wrapped.message).not.toContain("admin");
    expect(wrapped.message).toBe("Authentication failed");
    expect(wrapped.detail).toContain("admin");
  });

  it("sanitizes Neo4j connection error — does not leak hostname", () => {
    const raw = {
      code: "ServiceUnavailable",
      message: "Could not connect to bolt://prod-neo4j.internal:7687",
    };
    const wrapped = wrapError(raw, "neo4j");
    expect(wrapped.message).not.toContain("prod-neo4j");
    expect(wrapped.message).not.toContain("7687");
    expect(wrapped.message).toBe("Connection failed");
    expect(wrapped.detail).toContain("prod-neo4j");
  });

  it("uses safe message for each error type", () => {
    const cases: Array<{
      raw: unknown;
      db: "neo4j" | "postgresql";
      expectedType: ConnectorErrorType;
      expectedMessage: string;
    }> = [
      {
        raw: { code: "ServiceUnavailable", message: "conn error" },
        db: "neo4j",
        expectedType: ConnectorErrorType.CONNECTION,
        expectedMessage: "Connection failed",
      },
      {
        raw: { code: "Neo.ClientError.Security.Unauthorized", message: "bad" },
        db: "neo4j",
        expectedType: ConnectorErrorType.AUTHENTICATION,
        expectedMessage: "Authentication failed",
      },
      {
        raw: {
          message: "The transaction has been terminated. Retry your query",
        },
        db: "neo4j" as const,
        expectedType: ConnectorErrorType.TIMEOUT,
        expectedMessage: "Query timed out",
      },
      {
        raw: { code: "42601", message: "syntax error at position 5" },
        db: "neo4j" as const,
        expectedType: ConnectorErrorType.QUERY,
        expectedMessage: "Query execution failed",
      },
      {
        raw: { code: "25006", message: "cannot execute INSERT in read-only" },
        db: "postgresql" as const,
        expectedType: ConnectorErrorType.READ_ONLY_VIOLATION,
        expectedMessage: "Write operation not permitted in read-only mode",
      },
    ];

    for (const { raw, db, expectedType, expectedMessage } of cases) {
      const wrapped = wrapError(raw, db);
      expect(wrapped.type).toBe(expectedType);
      expect(wrapped.message).toBe(expectedMessage);
    }
  });

  it("stores raw detail for server-side logging", () => {
    const raw = new Error("Some internal detail with host=db.prod:5432");
    (raw as unknown as { code: string }).code = "08001";
    const wrapped = wrapError(raw, "postgresql");
    expect(wrapped.detail).toBe("Some internal detail with host=db.prod:5432");
    expect(wrapped.message).toBe("Connection failed");
  });

  it("handles non-Error objects", () => {
    const wrapped = wrapError("raw string error", "neo4j");
    expect(wrapped.message).toBe("An unexpected error occurred");
    expect(wrapped.detail).toBe("raw string error");
  });

  it("handles null/undefined errors", () => {
    const wrapped = wrapError(null, "postgresql");
    expect(wrapped.message).toBe("An unexpected error occurred");
  });
});
