import { existsSync } from "node:fs";
import { buildSeedEnv } from "../../lib/docker-env.js";
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

function neo4jEnv(
  config: ReturnType<typeof readProjectConfig>,
): Record<string, string> {
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

export async function seedPostgres(): Promise<void> {
  const config = readProjectConfig();
  assertSafePath(config.seed.script, "seed.script");
  const spinner = createSpinner("Seeding PostgreSQL demo data...");
  spinner.start();

  // buildSeedEnv keys off getMode(): in Docker mode it threads the internal
  // hostnames, a localhost DSN, and the docker/.env ENCRYPTION_KEY (#969,
  // #1039); in local mode it returns process.env unchanged.
  const env = buildSeedEnv(config);

  run(`node ${paths.root}/${config.seed.script}`, {
    cwd: paths.root,
    env,
  });
  spinner.succeed("PostgreSQL seeded with demo data");
}

export async function runDbSeed(opts?: {
  neo4j?: boolean;
  demo?: boolean;
}): Promise<void> {
  const seedNeo4jOnly = opts?.neo4j && !opts?.demo;
  const seedDemoOnly = opts?.demo && !opts?.neo4j;
  const seedBoth = (!opts?.neo4j && !opts?.demo) || (opts?.neo4j && opts?.demo);

  if (seedBoth || seedNeo4jOnly) {
    await seedNeo4j();
  }

  if (seedBoth || seedDemoOnly) {
    // Docker vs local is derived inside seedPostgres (via getMode), so no
    // caller can forget to thread the encryption key (#1039).
    await seedPostgres();
  }

  success("Seeding complete");
}
