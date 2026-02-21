import { createHash } from "crypto";

/**
 * Computes a deterministic 16-char hex result ID from a connection ID,
 * query string and optional parameters.
 *
 * Normalization: trim + collapse whitespace + lowercase so minor formatting
 * differences don't invalidate the hash.
 */
export function computeResultId(
  connectionId: string,
  query: string,
  params?: Record<string, unknown>
): string {
  const normalizedQuery = query.trim().replace(/\s+/g, " ").toLowerCase();
  return createHash("sha256")
    .update(connectionId)
    .update("\x00")
    .update(normalizedQuery)
    .update("\x00")
    .update(JSON.stringify(params ?? null))
    .digest("hex")
    .slice(0, 16);
}
