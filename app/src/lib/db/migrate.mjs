// Plain JavaScript so the repo's `scripts/db-migrate.mjs` can run it with bare node,
// outside the Next build: `neoboard db migrate` and the server's boot migration
// share one migrator, one lock and one error text (#2019).
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";

/**
 * Application-wide advisory lock key for schema migrations. Concurrent
 * replicas booting at the same time serialize here: the first runs the
 * migrations, the rest wait and then no-op (drizzle skips applied entries).
 */
export const MIGRATION_LOCK_ID = 772002001;

/**
 * Apply pending schema migrations using drizzle's programmatic migrator,
 * serialized across replicas via a Postgres advisory lock.
 *
 * `lockTimeoutMs` bounds the wait for the lock, and only that wait: the
 * migration's own statements keep Postgres's default. A booting replica
 * passes none and waits for the one that migrates; `neoboard db migrate`
 * passes one, so a session stuck holding the lock fails it with
 * "lock timeout" instead of hanging it (#2019).
 *
 * @param {string} url
 * @param {string} migrationsFolder
 * @param {{ lockTimeoutMs?: number }} [options]
 * @returns {Promise<void>}
 */
export async function migrateWithLock(url, migrationsFolder, options = {}) {
  const { lockTimeoutMs } = options;
  const client = postgres(url, { max: 1 });
  try {
    if (lockTimeoutMs) {
      await client`select set_config('lock_timeout', ${String(lockTimeoutMs)}, false)`;
    }
    await client`select pg_advisory_lock(${MIGRATION_LOCK_ID})`;
    if (lockTimeoutMs) {
      await client`select set_config('lock_timeout', '0', false)`;
    }
    try {
      await migrate(drizzle(client), { migrationsFolder });
    } finally {
      await client`select pg_advisory_unlock(${MIGRATION_LOCK_ID})`;
    }
  } finally {
    await client.end();
  }
}

/**
 * What an operator needs from a failed migration. drizzle wraps the
 * database's error, so its own message names only the statement; the reason,
 * a migration's RAISE text included, is on `cause` (#2001).
 *
 * @param {unknown} err
 * @returns {string}
 */
export function describeMigrationError(err) {
  if (!(err instanceof Error)) return String(err);
  const cause =
    /** @type {{ message?: string; detail?: string } | undefined} */ (
      err.cause
    );
  return [err.message, cause?.message, cause?.detail]
    .filter(Boolean)
    .join("\n  ");
}
