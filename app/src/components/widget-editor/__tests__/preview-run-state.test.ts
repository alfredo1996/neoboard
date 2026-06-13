import { describe, it, expect } from "vitest";
import { isRunDisabled } from "../preview-run-state";

describe("isRunDisabled (#1048)", () => {
  it("enables Run as soon as a connection is selected with a non-empty query", () => {
    // No connection yet → disabled, even with a query typed.
    expect(isRunDisabled("", "MATCH (n) RETURN n", false)).toBe(true);
    // Connection now selected → enabled (no dead period).
    expect(isRunDisabled("conn-1", "MATCH (n) RETURN n", false)).toBe(false);
  });

  it("stays disabled with an empty / whitespace query", () => {
    expect(isRunDisabled("conn-1", "", false)).toBe(true);
    expect(isRunDisabled("conn-1", "   ", false)).toBe(true);
  });

  it("is disabled while a preview is in flight", () => {
    expect(isRunDisabled("conn-1", "RETURN 1", true)).toBe(true);
  });
});
