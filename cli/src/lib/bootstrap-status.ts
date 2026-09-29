import { readOneValue } from "./pg-read.js";

/**
 * Is the instance still waiting for its first admin account? (#1312)
 *
 * Asks the database what the app's own bootstrap check asks (`areUsersEmpty`
 * in app/src/lib/auth/signup.ts): is there any user? Asking the database, not
 * the running app, answers a databases-only start too, and `start` calls this
 * only after migrations, when the database is up (#2057).
 *
 * Decides whether the ready banner guides the first signup and shows the
 * bootstrap token. Once an admin exists the token is spent, and printing a
 * live secret that nobody needs is gratuitous.
 *
 * Fails OPEN (returns true) when the database can't be read. The cost of a
 * false positive is showing the operator a secret they already own — they
 * generated it and it sits in a file on their disk. The cost of a false
 * negative is a user stranded at a signup form demanding a token nobody told
 * them about, which is the exact dead end this feature exists to remove.
 */
export async function isBootstrapPending(): Promise<boolean> {
  try {
    return readOneValue('SELECT 1 FROM "user" LIMIT 1') === null;
  } catch {
    return true;
  }
}
