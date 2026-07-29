import { existsSync, readFileSync } from "node:fs";
import { composePs, isPgReady, isNeo4jReady } from "../lib/docker.js";
import { paths, getMode, readProjectConfig } from "../lib/config.js";
import { info } from "../lib/output.js";
import { runOrNull } from "../lib/exec.js";

/**
 * `errors` out of a /api/health body, tolerating the `{data:{...}}` envelope
 * the route returns and a bare payload alike.
 *
 * An unreadable body is NOT a failure: a 200 means the app answered, and
 * inventing an "unhealthy" from a payload we merely failed to parse would
 * reintroduce exactly the false negative of #1368.
 */
function healthErrors(body: string): string[] {
  try {
    const parsed = JSON.parse(body);
    const { errors } = parsed?.data ?? parsed;
    return Array.isArray(errors) ? errors.map(String) : [];
  } catch {
    return [];
  }
}

/**
 * Health of the app, probed at /api/health — NOT at `/` (#1368).
 *
 * `/` is auth-gated, so the sessionless request curl makes is *supposed* to
 * 307 to /login. Treating only 200 as healthy therefore reported every
 * working install as "unhealthy (HTTP 307)" — there was no state in which
 * that line was right, and it sent operators debugging a non-problem.
 * /api/health needs no session and is already what the compose healthcheck
 * targets, so the CLI and Docker now agree.
 */
function getAppHealth(port: number): string {
  // Body AND status code (last line), so an app that is up but degraded can
  // be told from a healthy one by the `errors` its payload carries.
  const out = runOrNull(
    `curl -s -w "\\n%{http_code}" http://localhost:${port}/api/health`,
  );
  if (!out) return "not running";
  const split = out.lastIndexOf("\n");
  const code = split === -1 ? out : out.slice(split + 1);
  if (code !== "200") return `unhealthy (HTTP ${code})`;
  const errors = healthErrors(split === -1 ? "" : out.slice(0, split));
  return errors.length > 0 ? `unhealthy (${errors.join("; ")})` : "healthy";
}

function getMigrationStatus(): string {
  if (!existsSync(paths.journalPath)) return "no journal found";
  try {
    const journal = JSON.parse(readFileSync(paths.journalPath, "utf-8"));
    const count = journal.entries?.length ?? 0;
    const latest = journal.entries?.[count - 1]?.tag ?? "none";
    return `${count} applied (latest: ${latest})`;
  } catch {
    return "error reading journal";
  }
}

function getVersion(): string {
  try {
    const pkg = JSON.parse(
      readFileSync(`${paths.root}/cli/package.json`, "utf-8"),
    );
    return pkg.version ?? "unknown";
  } catch {
    return "unknown";
  }
}

export async function runStatus(): Promise<void> {
  const mode = getMode();
  const config = readProjectConfig();
  const containers = composePs();

  info(`Mode:        ${mode}`);
  info(`Version:     ${getVersion()}`);
  info(
    `Docker:      ${containers.length > 0 ? `running (${containers.length} containers)` : "no containers"}`,
  );
  info("");

  const pgHealthy = await isPgReady();
  const neo4jHealthy = isNeo4jReady();
  const appHealth = getAppHealth(config.ports.app);

  info("Service      Status");
  info("\u2500".repeat(30));
  info(
    `PostgreSQL   ${pgHealthy ? "healthy" : "stopped"} (localhost:${config.ports.postgres})`,
  );
  info(
    `Neo4j        ${neo4jHealthy ? "healthy" : "stopped"} (localhost:${config.ports.neo4j_bolt})`,
  );
  info(`App          ${appHealth} (http://localhost:${config.ports.app})`);
  info("");
  info(`Migrations:  ${getMigrationStatus()}`);
}
