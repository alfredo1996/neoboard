import { migrateWithLock } from "./migrate.mjs";

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
  await migrateWithLock(
    url,
    process.env.MIGRATIONS_DIR ?? "drizzle/migrations",
  );
}
