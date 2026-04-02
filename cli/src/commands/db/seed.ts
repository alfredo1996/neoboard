import { run } from "../../lib/exec.js";
import { dockerExec } from "../../lib/docker.js";
import { paths, readProjectConfig } from "../../lib/config.js";
import { success, createSpinner } from "../../lib/output.js";

function getNeo4jNodeCount(): number {
  const config = readProjectConfig();
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
  dockerExec(
    "neoboard-neo4j",
    `cypher-shell -u ${config.neo4j.user} -p ${config.neo4j.password} -f /var/lib/neo4j/import/init.cypher`,
  );
  spinner.succeed("Neo4j seeded with demo data");
}

export async function seedPostgres(): Promise<void> {
  const config = readProjectConfig();
  const spinner = createSpinner("Seeding PostgreSQL demo data...");
  spinner.start();

  run(`node ${paths.root}/${config.seed.script}`, { cwd: paths.root });
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
    await seedPostgres();
  }

  success("Seeding complete");
}
