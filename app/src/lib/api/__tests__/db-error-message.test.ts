import { describe, it, expect } from "vitest";
import { ConnectorError, ConnectorErrorType } from "@neoboard/connection";
import { describeWriteError } from "../db-error-message";

/**
 * describeWriteError turns a driver/ConnectorError into a SPECIFIC but SAFE
 * user message (#1162). It surfaces the constraint kind + column/constraint
 * name, which describe the schema the user is already writing to — but never
 * the raw SQL, the driver message, or the row `detail` (which leaks data).
 *
 * It also says which 4xx the error is (#1409): every recognised code is a
 * problem with what the user submitted, never a server fault.
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
    const described = describeWriteError(notNullRaw);
    expect(described).toBeDefined();
    expect(described!.message).toContain("rating");
    expect(described!.message.toLowerCase()).toContain("required");
  });

  it("carries the NOT NULL column so the form can attach the error to its field (#1409)", () => {
    expect(describeWriteError(notNullRaw)).toMatchObject({
      code: "VALIDATION_ERROR",
      column: "rating",
    });
  });

  it("has no column for a NOT NULL violation the driver did not name", () => {
    const described = describeWriteError({ code: "23502" });
    expect(described!.message).toBe("A required field is missing.");
    expect(described!.column).toBeUndefined();
  });

  it("never leaks the row detail, driver message, or SQL", () => {
    const { message } = describeWriteError(notNullRaw)!;
    expect(message).not.toContain("Failing row");
    expect(message).not.toContain("null value in column");
    expect(message).not.toContain("2026-07-03");
  });

  it("unwraps a ConnectorError's originalError", () => {
    const wrapped = new ConnectorError(
      "wrapped",
      ConnectorErrorType.QUERY,
      notNullRaw,
    );
    expect(describeWriteError(wrapped)).toMatchObject({ column: "rating" });
  });

  it.each([
    ["23505", "already exists", "CONFLICT"],
    ["23503", "referenced", "VALIDATION_ERROR"],
    ["23514", "constraint", "VALIDATION_ERROR"],
    ["22P02", "format", "VALIDATION_ERROR"],
    ["22003", "range", "VALIDATION_ERROR"],
    ["22001", "too long", "VALIDATION_ERROR"],
    ["22007", "date or time", "VALIDATION_ERROR"],
    ["22008", "date or time", "VALIDATION_ERROR"],
    ["23P01", "conflicts", "VALIDATION_ERROR"],
    ["25006", "read-only", "FORBIDDEN"],
    // Neo4j: a unique or property-existence constraint the submission broke.
    [
      "Neo.ClientError.Schema.ConstraintValidationFailed",
      "constraint",
      "VALIDATION_ERROR",
    ],
  ])(
    "maps driver code %s to a specific message and a 4xx code",
    (code, needle, apiCode) => {
      // A column on a non-NOT-NULL error is not "the field that was blank".
      const described = describeWriteError({ code, column: "c" });
      expect(described, `code ${code}`).toBeDefined();
      expect(described!.message.toLowerCase()).toContain(needle);
      expect(described!.code).toBe(apiCode);
      expect(described!.column).toBeUndefined();
    },
  );

  it.each(["42601", "42P01", "42703"])(
    "leaves query-structure error %s generic (not form-user-actionable; keeps the safe-message contract)",
    (code) => {
      expect(describeWriteError({ code })).toBeUndefined();
    },
  );

  it("returns undefined for unknown / unmapped codes (caller falls back)", () => {
    expect(describeWriteError({ code: "XX999" })).toBeUndefined();
    expect(describeWriteError({})).toBeUndefined();
    expect(describeWriteError(new Error("boom"))).toBeUndefined();
    expect(describeWriteError(null)).toBeUndefined();
  });
});
