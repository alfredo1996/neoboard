import { sanitizeErrorMessage } from "@/lib/api/api-utils";
import {
  classifyConnectionError,
  CONNECTION_CHECK_FALSE_MESSAGE,
  type ConnectionErrorCode,
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

/** A driver check that returned false without throwing — no message to classify. */
export function connectionCheckFalseResult(): ConnectionTestResult {
  return {
    success: false,
    code: "unknown",
    error: CONNECTION_CHECK_FALSE_MESSAGE,
  };
}

/** A thrown driver error — classify for a targeted hint, then sanitize for display. */
export function connectionTestErrorResult(
  thrown: unknown,
): ConnectionTestResult {
  const rawMessage =
    thrown instanceof Error ? thrown.message : "Connection test failed";
  // Classify BEFORE sanitization — the classifier needs the raw driver text.
  const code = classifyConnectionError(rawMessage);
  const error = sanitizeErrorMessage(rawMessage, "Connection test failed");
  return { success: false, code, error };
}
