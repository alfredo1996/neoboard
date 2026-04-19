import { describe, it, expect } from "vitest";
import { anonymizeLogRecord, hashValue, maskUri } from "@/lib/log-anonymizer";

describe("hashValue", () => {
  it("prefixes output with sha256:", () => {
    expect(hashValue("user-1")).toMatch(/^sha256:[a-f0-9]{16}$/);
  });

  it("is deterministic — same input always yields same hash", () => {
    expect(hashValue("user-1")).toBe(hashValue("user-1"));
  });

  it("differentiates distinct inputs", () => {
    expect(hashValue("user-1")).not.toBe(hashValue("user-2"));
  });

  it("yields a 16-hex-char suffix (64 bits)", () => {
    const suffix = hashValue("anything").slice("sha256:".length);
    expect(suffix).toHaveLength(16);
  });
});

describe("maskUri", () => {
  it("strips username and password from a postgres URI", () => {
    const masked = maskUri("postgresql://admin:secret@db.example.com:5432/app");
    expect(masked).not.toContain("admin");
    expect(masked).not.toContain("secret");
    expect(masked).toContain("db.example.com");
    expect(masked).toContain("5432");
    expect(masked).toContain("/app");
    expect(masked).toContain("***");
  });

  it("strips credentials from a neo4j URI", () => {
    const masked = maskUri("neo4j://neo:neo123@graph.host:7687");
    expect(masked).not.toContain("neo123");
    expect(masked).toContain("graph.host");
    expect(masked).toContain("7687");
  });

  it("hashes a non-URL input as a fallback", () => {
    const masked = maskUri("not-a-url");
    expect(masked).toMatch(/^sha256:/);
  });
});

describe("anonymizeLogRecord", () => {
  it("hashes userId when present", () => {
    const out = anonymizeLogRecord({ userId: "user-42", otherField: "x" });
    expect(out.userId).toMatch(/^sha256:/);
    expect(out.otherField).toBe("x");
  });

  it("hashes email when present", () => {
    const out = anonymizeLogRecord({ email: "alice@example.com" });
    expect(out.email).toMatch(/^sha256:/);
    expect(out.email).not.toBe("alice@example.com");
  });

  it("hashes user_id snake_case variant", () => {
    const out = anonymizeLogRecord({ user_id: "u1" });
    expect(out.user_id).toMatch(/^sha256:/);
  });

  it("redacts params wholesale", () => {
    const out = anonymizeLogRecord({ params: { name: "Alice", age: 30 } });
    expect(out.params).toBe("[REDACTED]");
  });

  it("redacts password / passwordHash / token keys", () => {
    const out = anonymizeLogRecord({
      password: "hunter2",
      passwordHash: "$2b$12$...",
      token: "jwt-xyz",
    });
    expect(out.password).toBe("[REDACTED]");
    expect(out.passwordHash).toBe("[REDACTED]");
    expect(out.token).toBe("[REDACTED]");
  });

  it("masks connection URIs under known keys", () => {
    const out = anonymizeLogRecord({
      uri: "postgresql://admin:secret@host:5432/db",
    });
    expect(out.uri).toContain("host:5432/db");
    expect(out.uri).not.toContain("admin");
    expect(out.uri).not.toContain("secret");
  });

  it("preserves non-PII fields untouched", () => {
    const out = anonymizeLogRecord({
      event: "query_executed",
      durationMs: 42,
      rowCount: 15,
      status: "success",
      connectionType: "neo4j",
      query: "MATCH (n) RETURN n",
      tenantId: "tenant-1",
      truncated: false,
    });
    expect(out.event).toBe("query_executed");
    expect(out.durationMs).toBe(42);
    expect(out.rowCount).toBe(15);
    expect(out.status).toBe("success");
    expect(out.connectionType).toBe("neo4j");
    expect(out.query).toBe("MATCH (n) RETURN n");
    expect(out.tenantId).toBe("tenant-1");
    expect(out.truncated).toBe(false);
  });

  it("recurses into nested plain objects", () => {
    const out = anonymizeLogRecord({
      user: { userId: "inner", role: "admin" },
    });
    const nested = out.user as Record<string, unknown>;
    expect(nested.userId).toMatch(/^sha256:/);
    expect(nested.role).toBe("admin");
  });

  it("leaves arrays untouched", () => {
    const out = anonymizeLogRecord({
      tags: ["one", "two", "three"],
    });
    expect(out.tags).toEqual(["one", "two", "three"]);
  });

  it("leaves Date values untouched", () => {
    const date = new Date("2026-04-14T00:00:00Z");
    const out = anonymizeLogRecord({ when: date });
    expect(out.when).toBe(date);
  });

  it("leaves Error instances untouched (pino serialises them separately)", () => {
    const err = new Error("boom");
    const out = anonymizeLogRecord({ err });
    expect(out.err).toBe(err);
  });

  it("returns a new object — does not mutate the input", () => {
    const input = { userId: "u1", other: "x" };
    const out = anonymizeLogRecord(input);
    expect(input.userId).toBe("u1");
    expect(out).not.toBe(input);
  });

  it("handles the realistic audit log shape", () => {
    const record = {
      event: "query_executed",
      status: "success",
      userId: "user-42",
      tenantId: "tenant-a",
      connectionId: "conn-1",
      connectionType: "neo4j",
      accessMode: "read",
      query: "MATCH (n) RETURN n LIMIT 5",
      durationMs: 37,
      rowCount: 5,
      requestId: "req-xyz",
    };
    const out = anonymizeLogRecord(record);
    expect(out.userId).toMatch(/^sha256:/);
    expect(out.tenantId).toBe("tenant-a"); // tenant is not PII
    expect(out.query).toBe("MATCH (n) RETURN n LIMIT 5");
    expect(out.durationMs).toBe(37);
    expect(out.requestId).toBe("req-xyz");
  });

  it("produces the same hash for the same userId across calls (correlation)", () => {
    const a = anonymizeLogRecord({ userId: "u-same" });
    const b = anonymizeLogRecord({ userId: "u-same" });
    expect(a.userId).toBe(b.userId);
  });
});
