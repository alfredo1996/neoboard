import { describe, it, expect } from "vitest";
import {
  connectionCheckFalseResult,
  connectionTestErrorResult,
} from "../connection-test-result";

describe("connection-test-result (#1043)", () => {
  it("builds an actionable false result with code unknown", () => {
    const r = connectionCheckFalseResult();
    expect(r.success).toBe(false);
    expect(r.code).toBe("unknown");
    expect(r.error).not.toMatch(/check returned false/i);
    expect(r.error).toMatch(/verify the host, port, credentials/i);
  });

  it("classifies a thrown network error", () => {
    const r = connectionTestErrorResult(new Error("connect ECONNREFUSED"));
    expect(r.success).toBe(false);
    expect(r.code).toBe("network");
    expect(r.error).toBeTruthy();
  });

  it("classifies a thrown auth error", () => {
    const r = connectionTestErrorResult(
      new Error("password authentication failed for user"),
    );
    expect(r.code).toBe("auth_failed");
  });

  it("falls back for a non-Error throw", () => {
    const r = connectionTestErrorResult("boom");
    expect(r.success).toBe(false);
    expect(r.code).toBe("unknown");
  });

  // The URI has to reach the classifier for it to spot a Docker networking
  // miss — the route already has it, and passing it is the whole wiring (#1346).
  it("passes the URI and container flag through to the classifier", () => {
    expect(
      connectionTestErrorResult(
        new Error("Could not perform discovery. No routing servers available."),
        { uri: "neo4j://localhost:7688", containerised: true },
      ).code,
    ).toBe("container_loopback");
  });

  it("still classifies as network when no context is given", () => {
    // Both call sites must keep working unchanged if the context is absent.
    expect(
      connectionTestErrorResult(
        new Error("Could not perform discovery. No routing servers available."),
      ).code,
    ).toBe("network");
  });

  it("never echoes the URI into the user-facing error", () => {
    // A URI can carry a password. The classifier reads it; the result must not
    // carry it back out.
    const r = connectionTestErrorResult(new Error("ECONNREFUSED"), {
      uri: "postgresql://admin:hunter2@localhost:5432/app",
      containerised: true,
    });
    expect(JSON.stringify(r)).not.toContain("hunter2");
    expect(JSON.stringify(r)).not.toContain("localhost:5432");
  });
});
