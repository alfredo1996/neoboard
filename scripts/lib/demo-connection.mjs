/**
 * The `connection` rows and Postgres logins `scripts/seed-demo.mjs` writes
 * (#2048).
 *
 * Demo connections are shared with the workspace, the state "Share with
 * workspace" sets from the UI, so every demo persona can build widgets on
 * them. The column default is `private` (owner + admins only), which left
 * creator@ with no connection to pick.
 *
 * Shared means every persona can run any read query on them, reader@ included,
 * and the demo prints reader@'s password. So the Postgres ones never log in as
 * the server's superuser, which could read the app's own metadata database
 * (password and API key hashes) and run `COPY … TO PROGRAM` even inside a READ
 * ONLY transaction. They log in as two demo roles that reach the demo data and
 * nothing else: `neoboard_demo_read` (SELECT) and `neoboard_demo_write` (DML on
 * `neoboard_demo_public`, for the demo's forms).
 *
 * Writes on "(demo, write)": an ad hoc write runs only on a connection the
 * caller owns, so it answers 404 for anyone but its owner. A saved form runs on
 * it for anyone who can open the form's dashboard, whatever their `can_write`
 * (#1831), and anyone who can use the connection can save one. The write role
 * is what bounds that.
 *
 * The Neo4j connection keeps the `neo4j` login: Community has no roles, and
 * that server holds only the demo graph.
 *
 * Keys of the row helpers are the table's column names, for postgres.js
 * `sql(row)`.
 */

const READ = "neoboard_demo_read";
const WRITE = "neoboard_demo_write";

/** @param {string} configEncrypted */
export function demoConnectionUpdate(configEncrypted) {
  return { configEncrypted, visibility: "shared" };
}

/**
 * @param {{ id: string, userId: string, name: string, type: string, configEncrypted: string }} row
 */
export function demoConnectionInsert({
  id,
  userId,
  name,
  type,
  configEncrypted,
}) {
  return { id, userId, name, type, ...demoConnectionUpdate(configEncrypted) };
}

/**
 * The configs of the three Postgres demo connections. `pgHost` is where the
 * app reaches Postgres (see ./seed-hosts.mjs).
 *
 * @param {string} pgHost
 */
export function demoPgConfigs(pgHost) {
  const uri = `postgresql://${pgHost}:5432`;
  const read = { username: READ, password: READ };
  return {
    movies: { uri, ...read, database: "movies" },
    ecommerceRead: { uri: `${uri}/neoboard`, ...read, database: "neoboard" },
    ecommerceWrite: {
      uri: `${uri}/neoboard`,
      username: WRITE,
      password: WRITE,
      database: "neoboard",
    },
  };
}

// ponytail: the passwords are public, as neoboard/neoboard is; the roles reach
// only demo data, so a leak costs nothing the demo does not already print.
const ROLES_SQL = `
DO $$ BEGIN
  CREATE ROLE ${READ} LOGIN PASSWORD '${READ}';
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  CREATE ROLE ${WRITE} LOGIN PASSWORD '${WRITE}';
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
`;

const DEMO_SCHEMA_GRANTS_SQL = `
GRANT USAGE ON SCHEMA neoboard_demo_public TO ${READ}, ${WRITE};
GRANT SELECT ON ALL TABLES IN SCHEMA neoboard_demo_public TO ${READ};
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA neoboard_demo_public TO ${WRITE};
GRANT USAGE ON ALL SEQUENCES IN SCHEMA neoboard_demo_public TO ${WRITE};
`;

const MOVIES_GRANTS_SQL = `GRANT SELECT ON ALL TABLES IN SCHEMA public TO ${READ};`;

/**
 * Creates the demo roles and grants them the demo data. Run it after
 * `neoboard_demo_public` is recreated, since its `DROP … CASCADE` drops the
 * old grants. Needs a login that may create roles, as the compose superuser
 * can.
 *
 * @param {{ unsafe: (text: string) => Promise<unknown> }} sql the app database
 * @param {{ unsafe: (text: string) => Promise<unknown> }} movies the movies database
 */
export async function grantDemoRoles(sql, movies) {
  await sql.unsafe(ROLES_SQL);
  await sql.unsafe(DEMO_SCHEMA_GRANTS_SQL);
  try {
    await movies.unsafe(MOVIES_GRANTS_SQL);
  } catch (err) {
    // 3D000: no movies database. docker/postgres/init.sql creates it; a
    // server without it has nothing for PostgreSQL Movies to read anyway.
    if (err?.code !== "3D000") throw err;
    console.warn("    No movies database: skipped its grants.");
  }
}
