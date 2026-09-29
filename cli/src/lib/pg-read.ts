import { runFileOrNull, dockerExec } from "./exec.js";
import { readProjectConfig, getMode } from "./config.js";

/**
 * The first value a read-only query returns from NeoBoard's own database, or
 * null when it returns nothing (or, in local mode, when psql fails). Docker
 * mode goes through the postgres container and throws when `docker exec`
 * fails.
 *
 * `sql` must be a constant: in Docker mode it passes through a shell inside
 * single quotes.
 */
export function readOneValue(sql: string): string | null {
  const config = readProjectConfig();
  const { user, database } = config.postgres;
  // Same shell boundary the db commands use; user/database come from the
  // project config, which `config set` does not validate.
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(user)) return null;
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(database)) return null;

  const out =
    getMode() === "docker"
      ? dockerExec(
          "neoboard-postgres",
          `psql -U ${user} -d ${database} -tAc '${sql}'`,
        )
      : // argv, not a shell string. The SQL contains a double-quoted
        // identifier, and interpolating it into a double-quoted command let
        // the shell strip those quotes AND split the statement across four
        // argv slots — so Postgres folded `configEncrypted` to lowercase, the
        // column did not exist, and the resulting null read as
        // "no-credentials". doctor reported that on every local-mode install.
        runFileOrNull("psql", [
          "-h",
          "localhost",
          "-p",
          String(config.ports.postgres),
          "-U",
          user,
          "-d",
          database,
          "-tAc",
          sql,
        ]);

  const value = out?.trim();
  return value ? value : null;
}
