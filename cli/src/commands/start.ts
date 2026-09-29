import { composeUp } from "../lib/docker.js";
import { waitForHealth } from "../lib/health.js";
import { isPgReady, isNeo4jReady, isAppReady } from "../lib/docker.js";
import { readProjectConfig, getMode } from "../lib/config.js";
import { info, success, warn, banner, error } from "../lib/output.js";
import {
  runDoctor,
  printResults,
  checkCredentialDecryption,
  type CheckResult,
} from "./doctor.js";
import { runDbMigrate } from "./db/migrate.js";
import { readDockerEnvSecrets } from "../lib/docker-env.js";
import { isBootstrapPending } from "../lib/bootstrap-status.js";

/**
 * First-run guidance for the ready box, each block ending in a blank line.
 *
 * `start` has no users on a fresh database, so the first visit goes through
 * the bootstrap screen to create the admin (#1038). That needs
 * ADMIN_BOOTSTRAP_TOKEN, which the CLI generated into docker/.env, so it
 * shows the token too (#1312); local mode prints its own token in `init`.
 *
 * Only while that signup is still ahead (#2057): never for `demo`, which
 * seeds its own users right after this box, and not once the running app
 * says an admin exists, when the token is spent and printing a live secret
 * nobody needs is gratuitous. A docker/.env predating #1312 has no token,
 * and "Token: undefined" helps no one.
 */
async function firstRunLines(
  appRunning: boolean,
  seedsUsers: boolean,
): Promise<string[]> {
  if (seedsUsers) return [];
  if (!appRunning) {
    return [
      "First run:  start the app, then create your admin account in the browser",
      "",
    ];
  }
  if (!(await isBootstrapPending())) return [];
  const token = readDockerEnvSecrets().ADMIN_BOOTSTRAP_TOKEN;
  const tokenLines = token
    ? [
        `Token:      ${token}`,
        "            (bootstrap token, from docker/.env — needed once, at signup)",
        "",
      ]
    : [];
  return [
    "First run:  open the App URL to create your admin account",
    "",
    ...tokenLines,
  ];
}

export interface StartOptions {
  /**
   * When true, starts the full stack (app + DBs) via docker-compose.full.yml.
   * When false (default), starts DBs only via docker-compose.yml.
   * Only applies to Docker mode.
   */
  full?: boolean;
  /**
   * Let the app container reach databases on the HOST machine, by mapping
   * host.docker.internal (#1346). Opt-in: most installs do not need it, and it
   * routes from the container out to the host's network.
   */
  exposeHost?: boolean;
  /**
   * The caller seeds its own users next (`demo`), so the ready box has no
   * signup to guide and no bootstrap token to show (#2057).
   */
  seedsUsers?: boolean;
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
  const exposeHost = opts?.exposeHost ?? false;

  // --expose-host overlays extra_hosts onto the `neoboard` service, which only
  // the FULL docker compose defines. Without --full the overlay lands on a
  // service that does not exist and compose refuses the whole project with
  // "service neoboard has neither an image nor a build context specified" —
  // an error about the wrong thing entirely. In local mode the app runs on the
  // host, where localhost already reaches the host and the flag is meaningless.
  if (exposeHost && (mode !== "docker" || !full)) {
    error(
      mode === "docker"
        ? "--expose-host needs --full: it maps a hostname for the app container, which only the full stack starts. Try: neoboard start --full --expose-host"
        : "--expose-host applies to Docker mode only. In local mode the app runs on this machine, so `localhost` already reaches your databases.",
    );
    process.exitCode = 1;
    return false;
  }

  // 1. Prerequisite checks, before the stack exists (#2057)
  if (!passes(await runDoctor({ preflight: { full } }), mode)) return false;

  // 2. Start containers (only in Docker mode)
  if (mode === "docker") {
    if (full) {
      info("Starting full stack (app + databases) via Docker Compose...");
    } else {
      info("Starting database containers via Docker Compose...");
    }
    composeUp({ full, exposeHost });
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
      // `neoboard logs` reads the databases-only compose file and cannot
      // show this container (#1797).
      logsHint: "docker logs --tail 100 neoboard-app",
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

  // 5. Does the key decrypt what is stored? Only now is there a database to
  // ask; the preflight ran before it existed (#2057).
  if (!passes([await checkCredentialDecryption()], mode)) return false;

  // 6. Done
  const url = `http://localhost:${config.ports.app}`;
  const appRunning = full && mode === "docker";
  // The "start the app" hint must match the mode: `dev` only works in local
  // mode; Docker mode needs `start --full` (#968). The old banner always
  // said `neoboard dev`, which dead-ended Docker users.
  const startAppHint =
    mode === "docker" ? "neoboard start --full" : "neoboard dev";

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
    ...(await firstRunLines(appRunning, opts?.seedsUsers ?? false)),
    `Stop:       neoboard stop`,
    `Logs:       neoboard logs -f`,
    ...(appRunning ? ["App logs:   docker logs -f neoboard-app"] : []),
  ]);
  if (appRunning) {
    success(`Open ${url} in your browser`);
  } else {
    success(`Run '${startAppHint}' to start the app`);
  }
  return true;
}

/**
 * Print check results. A failure stops Docker mode, which is about to bind
 * ports and serve the app; local mode reports and carries on, as it always
 * has.
 */
function passes(results: CheckResult[], mode: "docker" | "local"): boolean {
  if (!printResults(results) || mode !== "docker") return true;
  process.exitCode = 1;
  return false;
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
  logsHint?: string;
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
    failWithHints(`${opts.failName} failed to start`, opts.logsHint);
    return false;
  }
}

/**
 * Print a red ERROR line followed by remediation hints, then mark the
 * process for a non-zero exit. Centralizes the "what to do next" message
 * for any docker-mode healthcheck timeout.
 */
function failWithHints(
  reason: string,
  logsHint = "neoboard logs -f",
): void {
  error(reason);
  console.log("");
  console.log(`  See logs:  ${logsHint}`);
  console.log("  Diagnose:  neoboard doctor");
  process.exitCode = 1;
}
