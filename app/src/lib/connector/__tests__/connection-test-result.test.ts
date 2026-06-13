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
});
