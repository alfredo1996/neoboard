import { composeUp } from "../lib/docker.js";
import { waitForHealth } from "../lib/health.js";
import { isPgReady, isNeo4jReady, isAppReady } from "../lib/docker.js";
import { readProjectConfig, getMode } from "../lib/config.js";
import { info, success, warn, banner, error } from "../lib/output.js";
import { runDoctor, printResults } from "./doctor.js";
import { runDbMigrate } from "./db/migrate.js";
import { readDockerEnvSecrets } from "../lib/docker-env.js";
import { isBootstrapPending } from "../lib/bootstrap-status.js";

/**
 * Show the bootstrap token only while it is still usable: a token is spent
 * once an admin exists, and printing a live secret nobody needs is gratuitous.
 * Also stays quiet when no token was generated (a docker/.env predating #1312),
 * rather than printing "Token: undefined".
 */
async function shouldShowBootstrapToken(): Promise<boolean> {
  if (!readDockerEnvSecrets().ADMIN_BOOTSTRAP_TOKEN) return false;
  return isBootstrapPending();
}

export interface StartOptions {
  /**
   * When true, starts the full stack (app + DBs) via docker-compose.full.yml.
   * When false (default), starts DBs only via docker-compose.yml.
   * Only applies to Docker mode.
   */
  full?: boolean;
}

/**
 * Returns true when the requested stack is up and healthy, false on any
 * failure (doctor, healthcheck timeout). Callers like `runSetup` use the
 * return value to abort follow-up steps instead of reporting success.
 */
export async function runStart(opts?: StartOptions): Promise<boolean> {
  const mode = getMode();
  const config = readProjectConfig();
  const full = opts?.full ?? false;

  // 1. Prerequisite checks
  const results = await runDoctor();
  const hasFailure = printResults(results);
  if (hasFailure && mode === "docker") {
    process.exitCode = 1;
    return false;
  }

  // 2. Start containers (only in Docker mode)
  if (mode === "docker") {
    if (full) {
      info("Starting full stack (app + databases) via Docker Compose...");
    } else {
      info("Starting database containers via Docker Compose...");
    }
    composeUp({ full });
  } else {
    info(
      "Local mode — skipping Docker. Ensure PostgreSQL and Neo4j are running.",
    );
  }

  // 3. Wait for health (PG, Neo4j, optionally app)
  const pgOk = await checkHealthOrFail({
    check: isPgReady,
    label: "PostgreSQL",
    failName: "PostgreSQL",
    localHint: `PostgreSQL not reachable on localhost:${config.ports.postgres}. Start it manually or use --mode docker.`,
    mode,
  });
  if (!pgOk) return false;

  const neo4jOk = await checkHealthOrFail({
    check: isNeo4jReady,
    label: "Neo4j",
    failName: "Neo4j",
    localHint: `Neo4j not reachable on localhost:${config.ports.neo4j_http}. Start it manually or use --mode docker.`,
    mode,
  });
  if (!neo4jOk) return false;

  // When the full stack is up, the Next.js app container takes another
  // 30–60s to boot. Poll /api/health so the CLI doesn't go silent and
  // the user gets a clear "ready" signal before the banner prints.
  if (full && mode === "docker") {
    const appOk = await checkHealthOrFail({
      check: isAppReady,
      label: "NeoBoard app",
      failName: "NeoBoard app",
      // App poll only runs in docker mode, so localHint is unused
      localHint: "",
      mode,
    });
    if (!appOk) return false;
  }

  // 4. Run migrations — abort (don't print "ready") if they fail, so callers
  // like setup/demo don't seed against a schema-less DB. (#MEDIUM)
  const migrated = await runDbMigrate({});
  if (!migrated) {
    error("Migrations failed — the stack is not ready.");
    process.exitCode = 1;
    return false;
  }

  // 5. Done
  const url = `http://localhost:${config.ports.app}`;
  const appRunning = full && mode === "docker";
  // The "start the app" hint must match the mode: `dev` only works in local
  // mode; Docker mode needs `start --full` (#968). The old banner always
  // said `neoboard dev`, which dead-ended Docker users.
  const startAppHint =
    mode === "docker" ? "neoboard start --full" : "neoboard dev";

  // The first admin can only be created by entering ADMIN_BOOTSTRAP_TOKEN on
  // the signup screen. The CLI generated it into docker/.env moments ago, so
  // it is the one component that knows both the value and the file — showing
  // it here removes the "find a secret nobody told you about" dead end
  // (#1312). Local mode already prints its token when generating .env.local.
  const bootstrapLines =
    appRunning && (await shouldShowBootstrapToken())
      ? [
          "",
          `Token:      ${readDockerEnvSecrets().ADMIN_BOOTSTRAP_TOKEN}`,
          "            (bootstrap token, from docker/.env — needed once, at signup)",
        ]
      : [];

  banner([
    appRunning ? "NeoBoard is running!" : "Databases are ready!",
    "",
    `Mode:       ${mode}${full ? " (full stack)" : ""}`,
    ...(appRunning
      ? [`App:        ${url}`]
      : [`App:        not started — run: ${startAppHint}`]),
    `Neo4j:      http://localhost:${config.ports.neo4j_http}`,
    `PostgreSQL: localhost:${config.ports.postgres}`,
    "",
    // First-run guidance: unlike `neoboard demo` (which seeds an admin and
    // prints its credentials), `setup`/`start` has no users yet — the first
    // visit goes through the bootstrap screen to create the admin account
    // (#1038). Without this line the banner dead-ends at a login wall.
    appRunning
      ? "First run:  open the App URL to create your admin account"
      : "First run:  start the app, then create your admin account in the browser",
    ...bootstrapLines,
    "",
    `Stop:       neoboard stop`,
    `Logs:       neoboard logs -f`,
  ]);
  if (appRunning) {
    success(`Open ${url} in your browser`);
  } else {
    success(`Run '${startAppHint}' to start the app`);
  }
  return true;
}

/**
 * Wait for a single readiness probe. On timeout, route to the right error UX:
 * local mode prints a hint and bails; docker mode prints the failure banner
 * with neoboard logs/doctor pointers. Returns true on success, false on
 * failure (caller should `return` to abort the start flow).
 */
async function checkHealthOrFail(opts: {
  check: () => boolean | Promise<boolean>;
  label: string;
  failName: string;
  localHint: string;
  mode: "docker" | "local";
}): Promise<boolean> {
  try {
    await waitForHealth({ check: opts.check, label: opts.label });
    return true;
  } catch {
    if (opts.mode === "local") {
      warn(opts.localHint);
      process.exitCode = 1;
      return false;
    }
    failWithHints(`${opts.failName} failed to start`);
    return false;
  }
}

/**
 * Print a red ERROR line followed by remediation hints, then mark the
 * process for a non-zero exit. Centralizes the "what to do next" message
 * for any docker-mode healthcheck timeout.
 */
function failWithHints(reason: string): void {
  error(reason);
  console.log("");
  console.log("  See logs:  neoboard logs -f");
  console.log("  Diagnose:  neoboard doctor");
  process.exitCode = 1;
}
