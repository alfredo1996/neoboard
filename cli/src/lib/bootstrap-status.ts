import { runOrNull } from "./exec.js";
import { readProjectConfig } from "./config.js";

/**
 * Is the instance still waiting for its first admin account? (#1312)
 *
 * `GET /api/auth/bootstrap-status` is public and returns only booleans, so
 * this is safe to call before anyone has logged in — which is precisely the
 * moment it matters.
 *
 * Used to decide whether the ready banner should show the bootstrap token.
 * Once an admin exists the token is spent, and printing a live secret that
 * nobody needs is gratuitous.
 *
 * Fails OPEN (returns true) when the endpoint can't be reached or parsed.
 * The cost of a false positive is showing the operator a secret they already
 * own — they generated it and it sits in a file on their disk. The cost of a
 * false negative is a user stranded at a signup form demanding a token nobody
 * told them about, which is the exact dead end this feature exists to remove.
 */
export async function isBootstrapPending(): Promise<boolean> {
  const config = readProjectConfig();
  const out = runOrNull(
    `curl -s --max-time 5 http://localhost:${config.ports.app}/api/auth/bootstrap-status`,
  );
  if (!out) return true;
  try {
    const parsed = JSON.parse(out) as {
      data?: { bootstrapRequired?: boolean };
    };
    // Only an explicit `false` proves an admin exists.
    return parsed.data?.bootstrapRequired !== false;
  } catch {
    return true;
  }
}
