import { existsSync } from "node:fs";
import { resolve, normalize } from "node:path";
import { run } from "../../lib/exec.js";
import { dockerExec } from "../../lib/docker.js";
import { paths, readProjectConfig } from "../../lib/config.js";
import { success, createSpinner } from "../../lib/output.js";

/** Validate a config value contains no shell-special characters. */
function assertSafeValue(value: string, label: string): void {
  if (/[;&|`$"'\\<>(){}!\n\r]/.test(value)) {
    throw new Error(
      `Unsafe characters in ${label}: "${value}". Check neoboard.config.json.`,
    );
  }
}

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

function getNeo4jNodeCount(): number {
  const config = readProjectConfig();
  assertSafeValue(config.neo4j.user, "neo4j.user");
  assertSafeValue(config.neo4j.password, "neo4j.password");
  const out = dockerExec(
    "neoboard-neo4j",
    `cypher-shell -u ${config.neo4j.user} -p ${config.neo4j.password} "MATCH (n) RETURN count(n) AS c"`,
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
  assertSafeValue(config.neo4j.user, "neo4j.user");
  assertSafeValue(config.neo4j.password, "neo4j.password");
  dockerExec(
    "neoboard-neo4j",
    `cypher-shell -u ${config.neo4j.user} -p ${config.neo4j.password} -f /var/lib/neo4j/import/init.cypher`,
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
  const env = dockerNetwork
    ? {
        ...process.env,
        NEO4J_HOST: "neoboard-neo4j",
        PG_HOST: "neoboard-postgres",
      }
    : process.env;

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
