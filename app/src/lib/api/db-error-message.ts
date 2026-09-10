import type { ApiErrorCode } from "./api-response";

/** A recognised write error: what to tell the user, and which 4xx it is. */
export interface WriteErrorDescription {
  code: Extract<ApiErrorCode, "VALIDATION_ERROR" | "CONFLICT" | "FORBIDDEN">;
  message: string;
  /** The column a NOT NULL violation names, so the form can find the field (#1409). */
  column?: string;
}

/**
 * Turn a database / ConnectorError into a SPECIFIC but SAFE user-facing
 * message for write (form) submissions (#1162).
 *
 * The write route intentionally suppresses raw driver errors (`safeMessage`)
 * because Postgres/Neo4j echo the user's SQL — and the row `detail` leaks data.
 * But the generic "Write query execution failed" tells the user nothing. This
 * maps the *safe* parts of a driver error — the error code and the offending
 * column/constraint name, which merely describe the schema the user is already
 * writing to — into an actionable message. It NEVER includes the raw message,
 * the SQL, or the row `detail`.
 *
 * Every code it recognises is a problem with what was submitted, not a server
 * fault, so each carries a 4xx code — a 500 here trips alerting and tells a
 * retry layer to resend a submission that can never succeed (#1409).
 *
 * Returns `undefined` for unknown/unmapped errors so the caller can fall back
 * to its generic message (and its 500).
 */
export function describeWriteError(
  error: unknown,
): WriteErrorDescription | undefined {
  const raw = unwrap(error);
  if (!raw) return undefined;

  const code = typeof raw.code === "string" ? raw.code : "";
  const column = typeof raw.column === "string" ? raw.column : undefined;
  const constraint =
    typeof raw.constraint === "string" ? raw.constraint : undefined;
  const invalid = (message: string): WriteErrorDescription => ({
    code: "VALIDATION_ERROR",
    message,
  });

  switch (code) {
    case "23502": // not_null_violation
      return column
        ? { ...invalid(`The field "${column}" is required.`), column }
        : invalid("A required field is missing.");
    case "23505": // unique_violation
      return {
        code: "CONFLICT",
        message: "A record with these values already exists.",
      };
    case "23503": // foreign_key_violation
      return invalid("A referenced record does not exist.");
    case "23514": // check_violation
      return invalid(
        constraint
          ? `A value failed a validation constraint (${constraint}).`
          : "A value failed a validation constraint.",
      );
    case "22P02": // invalid_text_representation
      return invalid("A value has an invalid format.");
    case "22003": // numeric_value_out_of_range
      return invalid("A numeric value is out of range.");
    case "22001": // string_data_right_truncation
      return invalid("A value is too long.");
    case "22007": // invalid_datetime_format
    case "22008": // datetime_field_overflow
      return invalid("A date or time value is invalid.");
    case "23P01": // exclusion_violation
      return invalid("A record conflicts with an existing one.");
    // Neo4j's one code for a unique, existence or key constraint.
    case "Neo.ClientError.Schema.ConstraintValidationFailed":
      return invalid("A value violates a database constraint.");
    case "25006": // read_only_sql_transaction
      return {
        code: "FORBIDDEN",
        message: "This connection is read-only; writes are not permitted.",
      };
    default:
      return undefined;
  }
}

/**
 * Extract the raw driver error object (with code/column/constraint) from a
 * ConnectorError wrapper or a plain error. Duck-typed rather than
 * `instanceof ConnectorError` — the error can cross package boundaries
 * (connector-sdk ↔ connection ↔ app), where duplicate module instances make
 * `instanceof` unreliable.
 */
function unwrap(
  error: unknown,
): { code?: unknown; column?: unknown; constraint?: unknown } | undefined {
  if (!error || typeof error !== "object") return undefined;
  const e = error as { code?: unknown; originalError?: unknown };
  // ConnectorError carries the driver error on `originalError`; prefer it when
  // it looks like a driver error (has a code).
  const nested = e.originalError;
  if (nested && typeof nested === "object" && "code" in nested) {
    return nested as { code?: unknown; column?: unknown; constraint?: unknown };
  }
  return e as { code?: unknown; column?: unknown; constraint?: unknown };
}
