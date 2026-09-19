/**
 * Standardized error types across all connectors.
 * Consumers catch ConnectorError instead of driver-specific exceptions.
 */
export enum ConnectorErrorType {
  TIMEOUT = "TIMEOUT",
  AUTHENTICATION = "AUTHENTICATION",
  /** The connection failed or dropped — but this is not proof the host is gone. */
  CONNECTION = "CONNECTION",
  READ_ONLY_VIOLATION = "READ_ONLY_VIOLATION",
  QUERY = "QUERY",
  UNKNOWN = "UNKNOWN",
  /** The connection URI cannot be used as written. */
  BAD_URI = "BAD_URI",
  /** Nothing answered: unroutable host, refused port, failed DNS. */
  NETWORK = "NETWORK",
  /** The submitted values break a rule of the target schema. */
  CONSTRAINT = "CONSTRAINT",
}

/** Which rule of the schema a write broke. `other` is a rule the connector cannot name. */
export type ConnectorConstraintKind =
  | "not_null"
  | "unique"
  | "foreign_key"
  | "check"
  | "exclusion"
  | "invalid_format"
  | "out_of_range"
  | "too_long"
  | "invalid_datetime"
  | "other";

/**
 * What one error IS, in terms every connector shares (#1903). NeoBoard turns
 * this into a status code, a retry decision and the words the user reads, so
 * it never has to recognise a driver's message or code itself.
 *
 * Plain data, and it travels to logs and API responses: a category, flags, and
 * at most the NAMES of a column and a constraint — which describe a schema the
 * user is already writing to. Never a value, a statement, a URI or the
 * driver's message.
 */
export interface ConnectorErrorClassification {
  type: ConnectorErrorType;
  /** Worth retrying as is: a timeout, a dropped socket, a busy pool. */
  transient: boolean;
  /** Set with `CONSTRAINT`, so a form can say which rule was broken, and where. */
  constraint?: {
    kind: ConnectorConstraintKind;
    column?: string;
    name?: string;
  };
  /** A write that read-only execution stopped — what a query preview shows as "this query writes". */
  blockedWrite?: boolean;
}

/** A connector's `classifyError` hook. Pure: it reads the error, nothing else. */
export type ClassifyError = (err: unknown) => ConnectorErrorClassification;

export class ConnectorError extends Error {
  public readonly type: ConnectorErrorType;
  public readonly classification: ConnectorErrorClassification;
  public readonly originalError?: unknown;

  /**
   * @param classified A full classification, or a bare type — which is
   * transient only when it is `TIMEOUT`.
   */
  constructor(
    message: string,
    classified:
      | ConnectorErrorType
      | ConnectorErrorClassification = ConnectorErrorType.UNKNOWN,
    originalError?: unknown,
  ) {
    super(message);
    this.name = "ConnectorError";
    this.classification =
      typeof classified === "string"
        ? {
            type: classified,
            transient: classified === ConnectorErrorType.TIMEOUT,
          }
        : classified;
    this.type = this.classification.type;
    this.originalError = originalError;
  }

  /**
   * The classification and nothing else. `originalError` and the message are
   * the driver's own words, which can quote the statement, row values or the
   * URI — so a serialised error never carries them.
   */
  toJSON(): {
    name: string;
    type: ConnectorErrorType;
    classification: ConnectorErrorClassification;
  } {
    return {
      name: this.name,
      type: this.type,
      classification: this.classification,
    };
  }
}

/**
 * By name, not `instanceof`: a connector package can resolve its own copy of
 * this module, and its errors are ConnectorErrors all the same.
 */
function isConnectorError(err: unknown): err is ConnectorError {
  return (
    err instanceof Error &&
    err.name === "ConnectorError" &&
    typeof (err as Partial<ConnectorError>).classification === "object"
  );
}

/**
 * The classifier of a connector that supplies none. It reads no message and no
 * code: it honours what a ConnectorError already says, and anything else is
 * UNKNOWN and not worth a retry.
 */
export function defaultClassifyError(
  err: unknown,
): ConnectorErrorClassification {
  return isConnectorError(err)
    ? err.classification
    : { type: ConnectorErrorType.UNKNOWN, transient: false };
}

function messageOf(err: unknown): string {
  if (err instanceof Error) return err.message;
  const message = (err as { message?: unknown } | null)?.message;
  return typeof message === "string" ? message : String(err);
}

/**
 * Wrap a raw driver error into a ConnectorError, classified by the connector's
 * own `classify`.
 *
 * An error that already is a ConnectorError comes back untouched: it was typed
 * where it was raised, and that verdict is final. Re-reading its message is how
 * a missing `$param_timeout` used to become a TIMEOUT (#1898).
 */
export function wrapError(
  err: unknown,
  classify: ClassifyError = defaultClassifyError,
): ConnectorError {
  if (isConnectorError(err)) return err;
  return new ConnectorError(messageOf(err), classify(err), err);
}
