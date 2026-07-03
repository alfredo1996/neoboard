import { describe, it, expect } from "vitest";
import { ConnectorError, ConnectorErrorType } from "@neoboard/connection";
import { describeWriteError } from "../db-error-message";

/**
 * describeWriteError turns a driver/ConnectorError into a SPECIFIC but SAFE
 * user message (#1162). It surfaces the constraint kind + column/constraint
 * name, which describe the schema the user is already writing to — but never
 * the raw SQL, the driver message, or the row `detail` (which leaks data).
 */
describe("describeWriteError", () => {
  // The real-world case from the form demo: NOT NULL on feedback.rating.
  const notNullRaw = {
    code: "23502",
    column: "rating",
    table: "feedback",
    detail: "Failing row contains (12, null, test, jpijpjp, 2026-07-03 ...).",
    message: 'null value in column "rating" of relation "feedback" ...',
  };

  it("names the required column for a NOT NULL violation (23502)", () => {
    const msg = describeWriteError(notNullRaw);
    expect(msg).toBeDefined();
    expect(msg).toContain("rating");
    expect(msg!.toLowerCase()).toContain("required");
  });

  it("never leaks the row detail, driver message, or SQL", () => {
    const msg = describeWriteError(notNullRaw)!;
    expect(msg).not.toContain("Failing row");
    expect(msg).not.toContain("null value in column");
    expect(msg).not.toContain("2026-07-03");
  });

  it("unwraps a ConnectorError's originalError", () => {
    const wrapped = new ConnectorError(
      "wrapped",
      ConnectorErrorType.QUERY,
      notNullRaw,
    );
    const msg = describeWriteError(wrapped);
    expect(msg).toContain("rating");
  });

  it.each([
    ["23505", "already exists"],
    ["23503", "referenced"],
    ["23514", "constraint"],
    ["22P02", "format"],
    ["22003", "range"],
  ])("maps PG code %s to a specific message", (code, needle) => {
    const msg = describeWriteError({ code });
    expect(msg, `code ${code}`).toBeDefined();
    expect(msg!.toLowerCase()).toContain(needle);
  });

  it.each(["42601", "42P01", "42703"])(
    "leaves query-structure error %s generic (not form-user-actionable; keeps the safe-message contract)",
    (code) => {
      expect(describeWriteError({ code })).toBeUndefined();
    },
  );

  it("surfaces a read-only violation (25006)", () => {
    expect(describeWriteError({ code: "25006" })!.toLowerCase()).toContain(
      "read-only",
    );
  });

  it("returns undefined for unknown / unmapped codes (caller falls back)", () => {
    expect(describeWriteError({ code: "XX999" })).toBeUndefined();
    expect(describeWriteError({})).toBeUndefined();
    expect(describeWriteError(new Error("boom"))).toBeUndefined();
    expect(describeWriteError(null)).toBeUndefined();
  });
});
