import { describe, it, expect } from "vitest";
import {
  ConnectionError,
  QueryError,
  QueryTimeoutError,
  SchemaError,
} from "../errors";

describe("connector error types", () => {
  describe("ConnectionError", () => {
    it("has correct name and code", () => {
      const err = new ConnectionError("host unreachable");
      expect(err.name).toBe("ConnectionError");
      expect(err.code).toBe("CONNECTION_FAILED");
      expect(err.message).toBe("host unreachable");
      expect(err instanceof Error).toBe(true);
    });

    it("accepts custom code", () => {
      const err = new ConnectionError("bad creds", "AUTH_FAILED");
      expect(err.code).toBe("AUTH_FAILED");
    });
  });

  describe("QueryError", () => {
    it("has correct name, code, and optional query", () => {
      const err = new QueryError("syntax error", "SYNTAX", "SELECT *");
      expect(err.name).toBe("QueryError");
      expect(err.code).toBe("SYNTAX");
      expect(err.query).toBe("SELECT *");
      expect(err instanceof Error).toBe(true);
    });

    it("defaults code to QUERY_FAILED", () => {
      const err = new QueryError("failed");
      expect(err.code).toBe("QUERY_FAILED");
      expect(err.query).toBeUndefined();
    });
  });

  describe("QueryTimeoutError", () => {
    it("extends QueryError with QUERY_TIMEOUT code", () => {
      const err = new QueryTimeoutError();
      expect(err.name).toBe("QueryTimeoutError");
      expect(err.code).toBe("QUERY_TIMEOUT");
      expect(err.message).toBe("Query timed out");
      expect(err instanceof QueryError).toBe(true);
      expect(err instanceof Error).toBe(true);
    });

    it("accepts custom message and query", () => {
      const err = new QueryTimeoutError("30s exceeded", "MATCH (n) RETURN n");
      expect(err.message).toBe("30s exceeded");
      expect(err.query).toBe("MATCH (n) RETURN n");
    });
  });

  describe("SchemaError", () => {
    it("has correct name and code", () => {
      const err = new SchemaError("permission denied");
      expect(err.name).toBe("SchemaError");
      expect(err.code).toBe("SCHEMA_FAILED");
      expect(err instanceof Error).toBe(true);
    });
  });
});
