// `neoboard db migrate` runs this (#2019). The drizzle-kit binary it ran
// before exited 1 with nothing on stderr, so the CLI had no error text to
// classify or show. This applies migrations with the server's own migrator.
import { fileURLToPath } from "node:url";
import {
  describeMigrationError,
  migrateWithLock,
} from "../app/src/lib/db/migrate.mjs";

const url = process.env.DATABASE_URL;
if (!url) {
  process.stderr.write("DATABASE_URL is required to run migrations\n");
  process.exit(1);
}

try {
  await migrateWithLock(
    url,
    process.env.MIGRATIONS_DIR ??
      fileURLToPath(new URL("../app/drizzle/migrations", import.meta.url)),
  );
} catch (err) {
  process.stderr.write(`${describeMigrationError(err)}\n`);
  process.exit(1);
}
