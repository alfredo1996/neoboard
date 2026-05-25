import { describe, it, expect } from "vitest";
import { isTransientQueryError } from "@/lib/query/transient-error-classifier";

/**
 * The classifier decides whether an unknown thrown value represents a
 * transient driver/connector failure (worth a Retry-After hint) or a
 * permanent failure (bad query, no connection, auth) where retrying
 * would just waste cycles.
 *
 * The shape of these errors is driver-specific (pg, neo4j, undici, etc.)
 * so the classifier matches on message substrings + common Node error
 * codes rather than typed error classes.
 */

describe("isTransientQueryError", () => {
  describe("transient (retry-worthy)", () => {
    it.each([
      ["ETIMEDOUT", new Error("connect ETIMEDOUT 10.0.0.1:5432")],
      [
        "statement_timeout",
        new Error("canceling statement due to statement timeout"),
      ],
      [
        "Neo4j query timeout",
        new Error("The transaction has been terminated. timed out"),
      ],
      ["query timeout exceeded", new Error("Query timeout exceeded (5000ms)")],
      ["ECONNRESET", new Error("read ECONNRESET")],
      [
        "connection terminated",
        new Error("Connection terminated unexpectedly"),
      ],
      ["broken pipe", new Error("write EPIPE: broken pipe")],
      ["socket hang up", new Error("socket hang up")],
      [
        "connection acquisition timeout",
        new Error("connection acquisition timeout"),
      ],
      [
        "server closed the connection",
        new Error("server closed the connection unexpectedly"),
      ],
    ])("classifies %s as transient", (_label, err) => {
      expect(isTransientQueryError(err)).toBe(true);
    });

    it("classifies errors with code ETIMEDOUT property as transient", () => {
      const err = Object.assign(new Error("network error"), {
        code: "ETIMEDOUT",
      });
      expect(isTransientQueryError(err)).toBe(true);
    });

    it("classifies errors with code ECONNRESET property as transient", () => {
      const err = Object.assign(new Error("driver crashed"), {
        code: "ECONNRESET",
      });
      expect(isTransientQueryError(err)).toBe(true);
    });
  });

  describe("permanent (no Retry-After)", () => {
    it.each([
      ["syntax error", new Error('syntax error at or near "FROM"')],
      ["relation missing", new Error('relation "users" does not exist')],
      ["column missing", new Error('column "foo" does not exist')],
      ["permission denied", new Error("permission denied for table users")],
      ["auth failed", new Error("password authentication failed for user")],
      ["ECONNREFUSED", new Error("connect ECONNREFUSED 127.0.0.1:5432")],
      ["DNS failure", new Error("getaddrinfo ENOTFOUND db.example.com")],
      ["invalid input", new Error("invalid input syntax for type integer")],
      ["Cypher syntax", new Error("Invalid input '*': expected an identifier")],
      ["generic crash", new Error("Cannot read properties of undefined")],
    ])("classifies %s as permanent", (_label, err) => {
      expect(isTransientQueryError(err)).toBe(false);
    });

    it("classifies ECONNREFUSED via code property as permanent", () => {
      const err = Object.assign(new Error("nope"), { code: "ECONNREFUSED" });
      expect(isTransientQueryError(err)).toBe(false);
    });
  });

  describe("edge cases", () => {
    it("returns false for non-Error throws", () => {
      expect(isTransientQueryError("string error")).toBe(false);
      expect(isTransientQueryError(null)).toBe(false);
      expect(isTransientQueryError(undefined)).toBe(false);
      expect(isTransientQueryError({ message: "timeout" })).toBe(false);
      expect(isTransientQueryError(42)).toBe(false);
    });

    it("is case-insensitive on keyword matching", () => {
      expect(
        isTransientQueryError(new Error("Connection TIMED OUT after 30s")),
      ).toBe(true);
      expect(
        isTransientQueryError(new Error("STATEMENT TIMEOUT exceeded")),
      ).toBe(true);
    });

    it("permanent indicators win over transient when both appear", () => {
      // A syntax error message that incidentally contains 'timeout' should
      // still be classified as permanent — the syntax part means a retry
      // won't help.
      expect(
        isTransientQueryError(
          new Error('syntax error at "timeout" near line 3'),
        ),
      ).toBe(false);
    });
  });
});
