/**
 * Resolve the database hosts baked into seeded demo connection URIs.
 *
 * The stored host must match where the **app** runs, which differs by mode and
 * cannot be a single hardcoded value on Docker Desktop:
 *
 *   - Docker full-stack (`neoboard demo` / `--full`): the app runs inside the
 *     `neoboard-app` container. `localhost` there is the container itself, not
 *     the DB containers, so connections are refused. The CLI's `buildSeedEnv`
 *     sets `PG_HOST` / `NEO4J_HOST` to the compose service hostnames
 *     (`neoboard-postgres` / `neoboard-neo4j`) — the same aliases the app's own
 *     `DATABASE_URL` uses — and we bake those in.
 *   - Local mode (`neoboard dev`): the app runs on the host and reaches the
 *     published DB ports at `localhost`. `buildSeedEnv` leaves the vars unset,
 *     so we fall back to `localhost`.
 *
 * Keying on the CLI-provided env (rather than where the seed process happens to
 * run) is what makes both modes work, and avoids the #898 footgun where a seed
 * running *inside* the app container baked container hostnames into a config
 * that host-side `npm run dev` could no longer reach.
 *
 * @param {Record<string, string | undefined>} [env=process.env]
 * @returns {{ pgHost: string, neo4jHost: string }}
 */
export function resolveSeedHosts(env = process.env) {
  return {
    pgHost: env.PG_HOST || "localhost",
    neo4jHost: env.NEO4J_HOST || "localhost",
  };
}
