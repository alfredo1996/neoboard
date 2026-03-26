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
});
