/**
 * Table-driven error classification (#1903).
 *
 * A connector knows its driver's codes and phrases; what to DO with them — walk
 * the rules in order, let "permanent" beat "transient" — is the same for every
 * connector, so it lives here once. A `classifyError` hook is then data:
 *
 *   export const classifyMydbError = createErrorClassifier({
 *     types: [
 *       { codes: ["E_LOGIN"], type: ConnectorErrorType.AUTHENTICATION },
 *       { ...UNREACHABLE_HOST_SIGNALS, type: ConnectorErrorType.NETWORK },
 *     ],
 *     permanent: PERMANENT_FAILURE_SIGNALS,
 *     transient: TRANSIENT_FAILURE_SIGNALS,
 *   });
 *
 * Nothing obliges a connector to use it: any function returning a
 * {@link ConnectorErrorClassification} is a valid hook.
 */

import { errorFacts, matches, type ErrorSignals } from "./error-signals";
import {
  ConnectorErrorType,
  type ClassifyError,
  type ConnectorConstraintKind,
  type ConnectorErrorClassification,
} from "./ConnectorError";

export interface ErrorClassifierTables {
  /** Walked in order: the first rule that matches names the type. No match is a `QUERY` error. */
  types: readonly (ErrorSignals & { type: ConnectorErrorType })[];
  /** Never worth a retry. Beats `transient` when both match: `syntax error near "timeout"` fails the same way twice. */
  permanent: ErrorSignals;
  transient: ErrorSignals;
  /** Driver code → the schema rule that was broken. A match is a `CONSTRAINT` error whatever `types` says. */
  constraints?: ReadonlyMap<string, ConnectorConstraintKind>;
  /** What a write stopped by read-only execution looks like. */
  blockedWrite?: ErrorSignals;
}

/** Build a `classifyError` hook from a connector's tables. */
export function createErrorClassifier(
  tables: ErrorClassifierTables,
): ClassifyError {
  return (err) => {
    const facts = errorFacts(err);
    if (!facts) return { type: ConnectorErrorType.UNKNOWN, transient: false };

    const kind = tables.constraints?.get(facts.code);
    const classification: ConnectorErrorClassification = {
      type: kind
        ? ConnectorErrorType.CONSTRAINT
        : (tables.types.find((rule) => matches(facts, rule))?.type ??
          ConnectorErrorType.QUERY),
      transient:
        !matches(facts, tables.permanent) && matches(facts, tables.transient),
    };
    if (kind) classification.constraint = { kind };
    if (tables.blockedWrite && matches(facts, tables.blockedWrite)) {
      classification.blockedWrite = true;
    }
    return classification;
  };
}

export {
  mergeSignals,
  MALFORMED_URI_SIGNALS,
  UNREACHABLE_HOST_SIGNALS,
  PERMANENT_FAILURE_SIGNALS,
  TRANSIENT_FAILURE_SIGNALS,
  type ErrorSignals,
} from "./error-signals";
