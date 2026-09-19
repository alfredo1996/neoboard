import type {
  ConnectorConstraintKind,
  ConnectorErrorClassification,
} from "@neoboard/connection";
import type { ApiErrorCode } from "./api-response";
import { classificationOf } from "@/lib/connector/connection-error-classifier";

/** A recognised write error: what to tell the user, and which 4xx it is. */
export interface WriteErrorDescription {
  code: Extract<ApiErrorCode, "VALIDATION_ERROR" | "CONFLICT" | "FORBIDDEN">;
  message: string;
  /** The column a NOT NULL violation names, so the form can find the field (#1409). */
  column?: string;
}

type Constraint = NonNullable<ConnectorErrorClassification["constraint"]>;

const CONSTRAINT_MESSAGES: Record<ConnectorConstraintKind, string> = {
  not_null: "A required field is missing.",
  unique: "A record with these values already exists.",
  foreign_key: "A referenced record does not exist.",
  check: "A value failed a validation constraint.",
  exclusion: "A record conflicts with an existing one.",
  invalid_format: "A value has an invalid format.",
  out_of_range: "A numeric value is out of range.",
  too_long: "A value is too long.",
  invalid_datetime: "A date or time value is invalid.",
  other: "A value violates a database constraint.",
};

function describeConstraint({
  kind,
  column,
  name,
}: Constraint): WriteErrorDescription {
  if (kind === "not_null" && column) {
    return {
      code: "VALIDATION_ERROR",
      message: `The field "${column}" is required.`,
      column,
    };
  }
  if (kind === "check" && name) {
    return {
      code: "VALIDATION_ERROR",
      message: `A value failed a validation constraint (${name}).`,
    };
  }
  return {
    code: kind === "unique" ? "CONFLICT" : "VALIDATION_ERROR",
    message: CONSTRAINT_MESSAGES[kind],
  };
}

/** Categories that are the submitter's to fix whatever constraint is or is not named. */
const BY_TYPE: Partial<
  Record<ConnectorErrorClassification["type"], WriteErrorDescription>
> = {
  READ_ONLY_VIOLATION: {
    code: "FORBIDDEN",
    message: "This connection is read-only; writes are not permitted.",
  },
};

/**
 * Turn a connector's error into a SPECIFIC but SAFE user-facing message for
 * write (form) submissions (#1162).
 *
 * The write route intentionally suppresses raw driver errors (`safeMessage`)
 * because drivers echo the user's statement — and the failing row leaks data.
 * But the generic "Write query execution failed" tells the user nothing. This
 * maps the *safe* part of the error — the classification its connector
 * attached: which rule was broken, and the NAME of the offending column or
 * constraint, which merely describe the schema the user is already writing to
 * — into an actionable message. It NEVER reads the raw message, the statement,
 * or the driver's own error. Which driver code means which rule is the
 * connector's business (#1903).
 *
 * Every category it recognises is a problem with what was submitted, not a
 * server fault, so each carries a 4xx code — a 500 here trips alerting and
 * tells a retry layer to resend a submission that can never succeed (#1409).
 *
 * Returns `undefined` for anything else so the caller can fall back to its
 * generic message (and its 500).
 */
export function describeWriteError(
  error: unknown,
): WriteErrorDescription | undefined {
  const classification = classificationOf(error);
  if (!classification) return undefined;
  return classification.constraint
    ? describeConstraint(classification.constraint)
    : BY_TYPE[classification.type];
}
