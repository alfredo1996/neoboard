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
 * Returns `undefined` for unknown/unmapped errors so the caller can fall back
 * to its generic message.
 */
export function describeWriteError(error: unknown): string | undefined {
  const raw = unwrap(error);
  if (!raw) return undefined;

  const code = typeof raw.code === "string" ? raw.code : "";
  const column = typeof raw.column === "string" ? raw.column : undefined;
  const constraint =
    typeof raw.constraint === "string" ? raw.constraint : undefined;

  switch (code) {
    case "23502": // not_null_violation
      return column
        ? `The field "${column}" is required.`
        : "A required field is missing.";
    case "23505": // unique_violation
      return "A record with these values already exists.";
    case "23503": // foreign_key_violation
      return "A referenced record does not exist.";
    case "23514": // check_violation
      return constraint
        ? `A value failed a validation constraint (${constraint}).`
        : "A value failed a validation constraint.";
    case "22P02": // invalid_text_representation
      return "A value has an invalid format.";
    case "22003": // numeric_value_out_of_range
      return "A numeric value is out of range.";
    case "25006": // read_only_sql_transaction
      return "This connection is read-only; writes are not permitted.";
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
