import { createConnection } from "node:net";
import { run, runOrNull, dockerExec as execInContainer } from "./exec.js";
import { paths, readProjectConfig, getMode } from "./config.js";
import { ensureDockerEnvFile } from "./docker-env.js";
import { join } from "node:path";

export function isDockerRunning(): boolean {
  return runOrNull("docker info") !== null;
}

/**
 * Reject a Postgres identifier that isn't a bare unquoted name before it is
 * interpolated into a shell command. `config set` doesn't validate string
 * values, so a `postgres.user` like `x; rm -rf ~` would otherwise reach the
 * shell via the readiness probe. Mirrors the guards in `db reset` / `db dump`
 * at their own shell boundaries. (#MEDIUM)
 */
function assertPgIdentifier(value: string, label: string): void {
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(value)) {
    throw new Error(`Invalid PostgreSQL identifier for ${label}: "${value}"`);
  }
}

export function composeFile(full = false): string {
  const name = full ? "docker-compose.full.yml" : "docker-compose.yml";
  return join(paths.dockerDir, name);
}

/**
 * Host-port bindings for compose, read from the project config on every
 * invocation (#1313).
 *
 * The configured ports already drove every readiness probe, the generated
 * DATABASE_URL and the banner URLs — but not the thing that actually binds
 * them, which was hardcoded in the compose files. So `neoboard config set
 * ports.app 4000` published on 3000, polled 4000, and reported "NeoBoard app
 * failed to start" for a stack that was up and healthy. The advertised remedy
 * for a busy port made the install worse than leaving it alone.
 *
 * Passed in the process env rather than the --env-file, for two reasons: the
 * env file is written once and never regenerated (it holds per-install
 * secrets), so a later `config set` would not reach it; and the DB-only
 * compose has no --env-file at all. Process env also outranks --env-file in
 * compose's precedence, which keeps the CI override working.
 *
 * Only the HOST side is configurable — container ports stay fixed, since
 * service-to-service URLs inside the compose network depend on them.
 */
function composeEnv(): NodeJS.ProcessEnv {
  const { ports } = readProjectConfig();
  return {
    ...process.env,
    NEOBOARD_PORT_APP: String(ports.app),
    NEOBOARD_PORT_POSTGRES: String(ports.postgres),
    NEOBOARD_PORT_NEO4J_HTTP: String(ports.neo4j_http),
    NEOBOARD_PORT_NEO4J_BOLT: String(ports.neo4j_bolt),
    // Must follow the app port or auth callbacks break on a remapped install.
    NEXTAUTH_URL: `http://localhost:${ports.app}`,
  };
}

/**
 * Overlay that lets the app container reach databases on the HOST (#1346).
 *
 * Opt-in per run rather than baked into the base compose files: most installs
 * do not need it — a database in the same compose network is reached by its
 * service name, a remote one by its hostname — and it routes from the
 * container to the host's network, which is not something to enable for
 * everyone by default.
 *
 * Layered AFTER the base file: compose merges left to right, so an overlay
 * listed first would be overridden by the base and silently do nothing.
 */
function exposeHostFlag(exposeHost: boolean | undefined): string {
  return exposeHost
    ? ` -f "${join(paths.dockerDir, "docker-compose.expose-host.yml")}"`
    : "";
}

export function composeUp(opts?: {
  full?: boolean;
  exposeHost?: boolean;
}): void {
  const file = composeFile(opts?.full);
  const overlay = exposeHostFlag(opts?.exposeHost);
  const env = composeEnv();
  if (opts?.full) {
    // The full stack needs per-install secrets (#970); generated once,
    // reused forever. OS env still overrides --env-file values (CI).
    const envFile = ensureDockerEnvFile();
    run(
      `docker compose -f "${file}"${overlay} --env-file "${envFile}" up -d --build`,
      { cwd: paths.root, env },
    );
    return;
  }
  run(`docker compose -f "${file}"${overlay} up -d --build`, {
    cwd: paths.root,
    env,
  });
}

export function composeDown(opts?: { volumes?: boolean }): void {
  const file = composeFile();
  const flags = opts?.volumes ? " -v" : "";
  // --remove-orphans sweeps containers that belong to the project but
  // aren't in this compose file — e.g. the app container started by the
  // full stack (`demo`/`setup --full`), which the DB-only file otherwise
  // leaves orphaned (#992).
  run(`docker compose -f "${file}" down --remove-orphans${flags}`, {
    cwd: paths.root,
  });
}

export interface ContainerInfo {
  name: string;
  state: string;
  status: string;
}

export function composePs(): ContainerInfo[] {
  const file = composeFile();
  // Quote the path — a checkout under a directory with a space (e.g.
  // "/Users/John Doe/neoboard") otherwise splits the -f argument, the command
  // fails, and status/orphan-sweep silently report "no containers". (#MEDIUM)
  const out = runOrNull(`docker compose -f "${file}" ps --format json`, {
    cwd: paths.root,
  });
  if (!out) return [];
  try {
    // docker compose ps --format json outputs one JSON object per line
    return out
      .split("\n")
      .filter(Boolean)
      .map((line) => {
        const obj = JSON.parse(line);
        return {
          name: obj.Name ?? obj.name ?? "",
          state: obj.State ?? obj.state ?? "",
          status: obj.Status ?? obj.status ?? "",
        };
      });
  } catch {
    return [];
  }
}

/** Check if a TCP port is accepting connections. */
export function isTcpReady(host: string, port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = createConnection({ host, port, timeout: 2000 });
    socket.on("connect", () => {
      socket.destroy();
      resolve(true);
    });
    socket.on("error", () => resolve(false));
    socket.on("timeout", () => {
      socket.destroy();
      resolve(false);
    });
  });
}

export async function isPgReady(): Promise<boolean> {
  const config = readProjectConfig();
  assertPgIdentifier(config.postgres.user, "postgres.user");
  const mode = getMode();
  if (mode === "local") {
    // Prefer the real protocol check when the client binary exists; fall
    // back to a TCP probe when the host lacks pg_isready (#1091) — a
    // missing binary must not read as "DB down" and dead-end the bootstrap.
    // `command -v` is POSIX-only: on Windows (cmd/PowerShell) this probe
    // itself fails, so the TCP fallback engages — the intended degradation
    // there too, not an error path.
    if (runOrNull("command -v pg_isready") !== null) {
      return (
        runOrNull(
          `pg_isready -h localhost -p ${config.ports.postgres} -U ${config.postgres.user}`,
        ) !== null
      );
    }
    return isTcpReady("localhost", config.ports.postgres);
  }
  try {
    execInContainer(
      "neoboard-postgres",
      `pg_isready -U ${config.postgres.user}`,
    );
    return true;
  } catch {
    return false;
  }
}

export function isNeo4jReady(): boolean {
  const config = readProjectConfig();
  const mode = getMode();
  if (mode === "local") {
    const out = runOrNull(
      `curl -s -o /dev/null -w "%{http_code}" http://localhost:${config.ports.neo4j_http}`,
    );
    return out === "200";
  }
  // Use Docker's built-in health status — much faster than spawning
  // cypher-shell (JVM startup) on every poll.
  const status = runOrNull(
    "docker inspect --format={{.State.Health.Status}} neoboard-neo4j",
  );
  return status?.trim() === "healthy";
}

/**
 * Probes the Next.js app's /api/health endpoint. Returns true on HTTP 200.
 * Used after the full-stack docker compose so the CLI can signal "ready"
 * to the user instead of going silent while the app container boots.
 */
export function isAppReady(): boolean {
  const config = readProjectConfig();
  const out = runOrNull(
    `curl -s -o /dev/null -w "%{http_code}" http://localhost:${config.ports.app}/api/health`,
  );
  return out === "200";
}
