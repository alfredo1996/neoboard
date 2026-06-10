import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";

/**
 * Application-wide advisory lock key for schema migrations. Concurrent
 * replicas booting at the same time serialize here: the first runs the
 * migrations, the rest wait and then no-op (drizzle skips applied entries).
 */
const MIGRATION_LOCK_ID = 772002001;

/**
 * Opt-in flag for running migrations at server boot. The production Docker
 * image sets MIGRATE_ON_START=1 (it has no other way to apply migrations —
 * drizzle-kit is a dev dependency and never ships in the standalone output).
 * Local development keeps using `npm run db:migrate`.
 */
export function shouldMigrateOnBoot(
  env: Record<string, string | undefined> = process.env,
): boolean {
  const value = env.MIGRATE_ON_START?.toLowerCase();
  return value === "1" || value === "true";
}

/**
 * Apply pending schema migrations using drizzle's programmatic migrator,
 * serialized across replicas via a Postgres advisory lock.
 *
 * MIGRATIONS_DIR overrides the journal location — the Docker image sets it
 * to the absolute path the migrations are copied to.
 */
export async function migrateOnBoot(): Promise<void> {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error("DATABASE_URL is required to run migrations on boot");
  }
  const migrationsFolder = process.env.MIGRATIONS_DIR ?? "drizzle/migrations";

  const client = postgres(url, { max: 1 });
  try {
    await client`select pg_advisory_lock(${MIGRATION_LOCK_ID})`;
    try {
      await migrate(drizzle(client), { migrationsFolder });
    } finally {
      await client`select pg_advisory_unlock(${MIGRATION_LOCK_ID})`;
    }
  } finally {
    await client.end();
  }
}
