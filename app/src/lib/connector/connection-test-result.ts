import { sanitizeErrorMessage } from "@/lib/api/api-utils";
import {
  connectionErrorCode,
  CONNECTION_CHECK_FALSE_MESSAGE,
  type ConnectionErrorCode,
  type ConnectionErrorContext,
} from "@/lib/connector/connection-error-classifier";

/**
 * Shared shape of a connection-test API result, so the `[id]/test` and
 * `test-inline` routes build it identically (#1043) — they previously
 * duplicated the false/catch handling.
 */
export interface ConnectionTestResult {
  success: boolean;
  code?: ConnectionErrorCode;
  error?: string;
}

/** A driver check that returned false without throwing — there is no error to read. */
export function connectionCheckFalseResult(): ConnectionTestResult {
  return {
    success: false,
    code: "unknown",
    error: CONNECTION_CHECK_FALSE_MESSAGE,
  };
}

/**
 * A thrown connector error — its connector's verdict picks the targeted hint,
 * and its message is sanitized for display.
 */
export function connectionTestErrorResult(
  thrown: unknown,
  context?: ConnectionErrorContext,
): ConnectionTestResult {
  const rawMessage =
    thrown instanceof Error ? thrown.message : "Connection test failed";
  // The context is read here and never returned: a URI can carry a password,
  // so it informs the code and goes no further (#1346).
  const code = connectionErrorCode(thrown, context);
  const error = sanitizeErrorMessage(rawMessage, "Connection test failed");
  return { success: false, code, error };
}
