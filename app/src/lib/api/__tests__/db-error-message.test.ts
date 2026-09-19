import { describe, it, expect } from "vitest";
import {
  ConnectorError,
  ConnectorErrorType,
  type ConnectorConstraintKind,
  type ConnectorErrorClassification,
} from "@neoboard/connection";
import { describeWriteError } from "../db-error-message";

/**
 * describeWriteError turns the classification a connector attached to a write
 * error into a SPECIFIC but SAFE user message (#1162). It surfaces the
 * constraint kind + column/constraint name, which describe the schema the user
 * is already writing to — but never the raw statement, the driver message, or
 * the row the driver quotes (which leaks data).
 *
 * It also says which 4xx the error is (#1409): every recognised category is a
 * problem with what the user submitted, never a server fault.
 *
 * Which driver code means which constraint is the connector's business
 * (#1903) — no code appears here.
 */
const DRIVER_MESSAGE =
  'null value in column "rating" — Failing row contains (12, null, 2026-07-03)';

const broke = (constraint: ConnectorErrorClassification["constraint"]) =>
  new ConnectorError(DRIVER_MESSAGE, {
    type: ConnectorErrorType.CONSTRAINT,
    transient: false,
    constraint,
  });

describe("describeWriteError", () => {
  it("names the required column for a NOT NULL violation", () => {
    const described = describeWriteError(
      broke({ kind: "not_null", column: "rating" }),
    );
    expect(described).toEqual({
      code: "VALIDATION_ERROR",
      message: 'The field "rating" is required.',
      // So the form can attach the error to its field (#1409).
      column: "rating",
    });
  });

  it("has no column for a NOT NULL violation the connector could not place", () => {
    expect(describeWriteError(broke({ kind: "not_null" }))).toEqual({
      code: "VALIDATION_ERROR",
      message: "A required field is missing.",
    });
  });

  it("names the check constraint when the connector knows it", () => {
    expect(
      describeWriteError(broke({ kind: "check", name: "rating_range" }))!
        .message,
    ).toBe("A value failed a validation constraint (rating_range).");
  });

  it("never leaks the driver's message", () => {
    const { message } = describeWriteError(
      broke({ kind: "not_null", column: "rating" }),
    )!;
    expect(message).not.toContain("Failing row");
    expect(message).not.toContain("null value in column");
    expect(message).not.toContain("2026-07-03");
  });

  it.each<[ConnectorConstraintKind, string, string]>([
    ["unique", "A record with these values already exists.", "CONFLICT"],
    ["foreign_key", "A referenced record does not exist.", "VALIDATION_ERROR"],
    ["check", "A value failed a validation constraint.", "VALIDATION_ERROR"],
    ["invalid_format", "A value has an invalid format.", "VALIDATION_ERROR"],
    ["out_of_range", "A numeric value is out of range.", "VALIDATION_ERROR"],
    ["too_long", "A value is too long.", "VALIDATION_ERROR"],
    [
      "invalid_datetime",
      "A date or time value is invalid.",
      "VALIDATION_ERROR",
    ],
    [
      "exclusion",
      "A record conflicts with an existing one.",
      "VALIDATION_ERROR",
    ],
    ["other", "A value violates a database constraint.", "VALIDATION_ERROR"],
  ])("says what a broken %s rule means, as a 4xx", (kind, message, code) => {
    // A column on a non-NOT-NULL error is not "the field that was blank".
    expect(describeWriteError(broke({ kind, column: "c" }))).toEqual({
      code,
      message,
    });
  });

  it("tells a read-only connection apart: 403, not a validation error", () => {
    expect(
      describeWriteError(
        new ConnectorError(
          DRIVER_MESSAGE,
          ConnectorErrorType.READ_ONLY_VIOLATION,
        ),
      ),
    ).toEqual({
      code: "FORBIDDEN",
      message: "This connection is read-only; writes are not permitted.",
    });
  });

  it.each([
    ConnectorErrorType.QUERY,
    ConnectorErrorType.TIMEOUT,
    ConnectorErrorType.NETWORK,
    ConnectorErrorType.UNKNOWN,
  ])(
    "leaves a %s error generic (not form-user-actionable; keeps the safe-message contract)",
    (type) => {
      expect(
        describeWriteError(new ConnectorError(DRIVER_MESSAGE, type)),
      ).toBeUndefined();
    },
  );

  it("returns undefined for an error no connector classified (caller falls back)", () => {
    expect(describeWriteError(new Error("boom"))).toBeUndefined();
    expect(describeWriteError({})).toBeUndefined();
    expect(describeWriteError(null)).toBeUndefined();
  });
});
