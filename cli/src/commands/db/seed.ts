import { existsSync } from "node:fs";
import { readDockerEnvSecrets } from "../../lib/docker-env.js";
import { resolve, normalize } from "node:path";
import { run } from "../../lib/exec.js";
import { dockerExec } from "../../lib/docker.js";
import { paths, readProjectConfig } from "../../lib/config.js";
import { success, createSpinner } from "../../lib/output.js";

/** Validate a seed script path stays within the project root. */
function assertSafePath(scriptPath: string, label: string): void {
  const resolved = resolve(paths.root, scriptPath);
  if (!resolved.startsWith(normalize(paths.root))) {
    throw new Error(`${label} escapes project root: "${scriptPath}"`);
  }
  if (!existsSync(resolved)) {
    throw new Error(`${label} not found: "${resolved}"`);
  }
}

function neo4jEnv(config: ReturnType<typeof readProjectConfig>): Record<string, string> {
  return {
    NEO4J_USERNAME: config.neo4j.user,
    NEO4J_PASSWORD: config.neo4j.password,
  };
}

function getNeo4jNodeCount(): number {
  const config = readProjectConfig();
  // Credentials go via environment (cypher-shell reads NEO4J_USERNAME /
  // NEO4J_PASSWORD) — never into argv, where `ps` and error messages can
  // expose them (#967). This also lifts the shell-safe charset restriction
  // on passwords.
  const out = dockerExec(
    "neoboard-neo4j",
    `cypher-shell "MATCH (n) RETURN count(n) AS c"`,
    { env: neo4jEnv(config) },
  );
  const match = out.match(/(\d+)/);
  return match ? parseInt(match[1], 10) : 0;
}

export async function seedNeo4j(): Promise<void> {
  const spinner = createSpinner("Seeding Neo4j...");
  spinner.start();

  const count = getNeo4jNodeCount();
  if (count > 0) {
    spinner.succeed(`Neo4j already has ${count} nodes — skipping seed`);
    return;
  }

  const config = readProjectConfig();
  dockerExec(
    "neoboard-neo4j",
    `cypher-shell -f /var/lib/neo4j/import/init.cypher`,
    { env: neo4jEnv(config) },
  );
  spinner.succeed("Neo4j seeded with demo data");
}

export async function seedPostgres(dockerNetwork = false): Promise<void> {
  const config = readProjectConfig();
  assertSafePath(config.seed.script, "seed.script");
  const spinner = createSpinner("Seeding PostgreSQL demo data...");
  spinner.start();

  // When the app runs inside Docker, seed with Docker-internal hostnames
  // so the stored connection URIs resolve inside the container network.
  let env: NodeJS.ProcessEnv = process.env;
  if (dockerNetwork) {
    env = {
      ...process.env,
      NEO4J_HOST: "neoboard-neo4j",
      PG_HOST: "neoboard-postgres",
    };
    // In Docker mode there's no app/.env.local. The host-side seed needs
    // a localhost DSN to reach the published Postgres port, and the SAME
    // ENCRYPTION_KEY the app container uses (from docker/.env) so seeded
    // connector credentials decrypt at runtime (#969). Only fill values
    // the caller hasn't already provided.
    const { user, password, database } = config.postgres;
    env.DATABASE_URL =
      env.DATABASE_URL ??
      `postgresql://${user}:${password}@localhost:${config.ports.postgres}/${database}`;
    if (!env.ENCRYPTION_KEY) {
      const dockerSecrets = readDockerEnvSecrets();
      if (dockerSecrets.ENCRYPTION_KEY) {
        env.ENCRYPTION_KEY = dockerSecrets.ENCRYPTION_KEY;
      }
    }
  }

  run(`node ${paths.root}/${config.seed.script}`, {
    cwd: paths.root,
    env,
  });
  spinner.succeed("PostgreSQL seeded with demo data");
}

export async function runDbSeed(opts?: {
  neo4j?: boolean;
  demo?: boolean;
  /** When true, seed connection URIs use Docker-internal hostnames. */
  dockerNetwork?: boolean;
}): Promise<void> {
  const seedNeo4jOnly = opts?.neo4j && !opts?.demo;
  const seedDemoOnly = opts?.demo && !opts?.neo4j;
  const seedBoth = (!opts?.neo4j && !opts?.demo) || (opts?.neo4j && opts?.demo);

  if (seedBoth || seedNeo4jOnly) {
    await seedNeo4j();
  }

  if (seedBoth || seedDemoOnly) {
    await seedPostgres(opts?.dockerNetwork ?? false);
  }

  success("Seeding complete");
}
