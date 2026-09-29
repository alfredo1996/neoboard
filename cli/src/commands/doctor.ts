import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { parse as parseEnv } from "dotenv";
import { runOrNull } from "../lib/exec.js";
import { isPortAvailable } from "../lib/ports.js";
import {
  paths,
  readProjectConfig,
  getMode,
  type ProjectConfig,
} from "../lib/config.js";
import { success, warn, info, error as logError } from "../lib/output.js";
import { probeCredentialDecryption } from "../lib/credential-probe.js";
import { DOCKER_ENV_PATH } from "../lib/docker-env.js";

export interface CheckResult {
  name: string;
  /**
   * "skip" exists so a check can decline to answer. Reporting "ok" when
   * nothing was actually verified is the false confidence the credential
   * probe was added to remove (#1274) — it would be the same bug in the
   * check that it is meant to catch in the install.
   */
  status: "ok" | "warn" | "fail" | "skip";
  message: string;
}

export function checkDockerRunning(): CheckResult {
  const ok = runOrNull("docker info") !== null;
  return {
    name: "Docker daemon",
    status: ok ? "ok" : "fail",
    message: ok ? "Docker daemon running" : "Docker daemon not running",
  };
}

export function checkDockerComposeV2(): CheckResult {
  const out = runOrNull("docker compose version");
  const ok = out !== null && out.includes("v2");
  return {
    name: "Docker Compose v2",
    status: ok ? "ok" : "fail",
    message: ok ? "Docker Compose v2 available" : "Docker Compose v2 not found",
  };
}

export function checkNodeVersion(): CheckResult {
  const major = parseInt(process.version.slice(1), 10);
  const ok = major >= 20;
  return {
    name: "Node.js",
    status: ok ? "ok" : "fail",
    message: ok
      ? `Node.js ${process.version}`
      : `Node.js >= 20 required (found: ${process.version})`,
  };
}

export async function checkPortAvailable(
  port: number,
  label: string,
): Promise<CheckResult> {
  const available = await isPortAvailable(port);
  return {
    name: `Port ${port} (${label})`,
    status: available ? "ok" : "warn",
    message: available
      ? `Port ${port} available`
      : `Port ${port} in use — another process may be running`,
  };
}

type Ports = ProjectConfig["ports"];
type PortKey = keyof Ports;

const PORT_LABELS: Record<PortKey, string> = {
  postgres: "PostgreSQL",
  neo4j_http: "Neo4j HTTP",
  neo4j_bolt: "Neo4j Bolt",
  app: "App",
};

/**
 * Host ports NeoBoard's own running containers publish. A port they hold is
 * not a conflict: `start` then `start --full` finds the databases already up
 * on theirs, and compose up leaves them be.
 */
function ownPublishedPorts(): Set<number> {
  // Docker matches the name regex anywhere in the name, so it is anchored to
  // the compose files' container_name values: `my-neoboard-neo4j` is foreign.
  const out = runOrNull(
    'docker ps --filter "name=^neoboard-(postgres|neo4j|app)$" --format "{{.Ports}}"',
  );
  return new Set(
    [...(out ?? "").matchAll(/:(\d+)->/g)].map((m) => Number(m[1])),
  );
}

/** The next free port above `port` that no other service is configured on. */
async function suggestFreePort(port: number, ports: Ports): Promise<string> {
  const taken = Object.values(ports);
  // ponytail: 20 tries is plenty on a dev machine; past that, the user picks.
  for (let p = port + 1; p <= Math.min(port + 20, 65535); p++) {
    if (!taken.includes(p) && (await isPortAvailable(p))) return String(p);
  }
  return "<free port>";
}

/**
 * A port the Docker stack publishes, with the fix when something else holds
 * it (#2057). `binding` means Compose is about to bind it: a busy port then
 * fails here instead of in docker-modem's "port is already allocated" trace.
 */
async function checkStackPort(
  key: PortKey,
  ports: Ports,
  own: ReadonlySet<number>,
  binding: boolean,
): Promise<CheckResult> {
  const port = ports[key];
  const result = await checkPortAvailable(port, PORT_LABELS[key]);
  if (result.status === "ok") return result;
  if (own.has(port)) {
    return {
      ...result,
      status: "ok",
      message: `Port ${port} in use by NeoBoard's own container`,
    };
  }
  const free = await suggestFreePort(port, ports);
  return {
    ...result,
    status: binding ? "fail" : "warn",
    message:
      `${result.name} is in use. Run \`neoboard config set ports.${key} ` +
      `${free}\`, or stop the other process.`,
  };
}

async function checkPorts(
  ports: Ports,
  preflight: DoctorOptions["preflight"],
): Promise<CheckResult[]> {
  const keys = Object.keys(PORT_LABELS) as PortKey[];
  // Local mode binds nothing: the busy ports there are the user's own
  // databases, which is what `start` expects to find.
  if (getMode() === "local") {
    return Promise.all(
      keys.map((key) => checkPortAvailable(ports[key], PORT_LABELS[key])),
    );
  }
  const own = ownPublishedPorts();
  // Only `start` is about to bind, and the app port only with --full.
  const binding = (key: PortKey) =>
    preflight !== undefined && (key !== "app" || preflight.full);
  return Promise.all(
    keys.map((key) => checkStackPort(key, ports, own, binding(key))),
  );
}

export function checkNodeModulesExist(): CheckResult {
  const exists = existsSync(`${paths.appDir}/node_modules`);
  return {
    name: "Dependencies",
    status: exists ? "ok" : "warn",
    message: exists
      ? "app/node_modules exists"
      : "app/node_modules missing — run 'neoboard init'",
  };
}

export function checkEnvFileExists(): CheckResult {
  const exists = existsSync(paths.envFile);
  return {
    name: ".env.local",
    status: exists ? "ok" : "warn",
    message: exists
      ? "app/.env.local exists"
      : "app/.env.local missing — run 'neoboard env'",
  };
}

export interface DoctorOptions {
  /**
   * Set by `start` before it brings the stack up (#2057). The ports it is
   * about to bind must be free, and the credential check waits for a
   * database, which `start` asks after migrations.
   */
  preflight?: { full: boolean };
}

export async function runDoctor(
  opts: DoctorOptions = {},
): Promise<CheckResult[]> {
  const config = readProjectConfig();
  const mode = getMode();

  // Docker checks are warnings (not failures) in local mode
  const dockerCheck = checkDockerRunning();
  const composeCheck = checkDockerComposeV2();
  if (mode === "local") {
    if (dockerCheck.status === "fail") dockerCheck.status = "warn";
    if (composeCheck.status === "fail") composeCheck.status = "warn";
  }

  const results: CheckResult[] = [
    dockerCheck,
    composeCheck,
    checkNodeVersion(),
  ];

  results.push(...(await checkPorts(config.ports, opts.preflight)));

  results.push(checkNodeModulesExist());
  results.push(checkEnvFileExists());
  results.push(
    opts.preflight
      ? {
          name: "Credential decryption",
          status: "skip",
          message:
            "Credential decryption: checked once the stack is up and migrated",
        }
      : await checkCredentialDecryption(),
  );

  return results;
}

/**
 * Is the configured ENCRYPTION_KEY the one that encrypted the stored
 * credentials? Everything else checks the key's SHAPE; nothing checked it was
 * the right key, so a mismatched instance passed every check and then failed
 * on every widget with a raw AES-GCM error (#1274).
 */
export async function checkCredentialDecryption(): Promise<CheckResult> {
  const name = "Credential decryption";
  const { outcome } = await probeCredentialDecryption(readEncryptionKey());

  switch (outcome) {
    case "ok":
      return {
        name,
        status: "ok",
        message: "Credential decryption: stored credentials decrypt",
      };
    case "mismatch":
      return {
        name,
        status: "fail",
        message:
          "Credential decryption: ENCRYPTION_KEY does not match the stored " +
          "credentials — they were encrypted with a different key. Restore " +
          "the original key, or set ENCRYPTION_KEY_OLD and rotate.",
      };
    case "no-credentials":
      return {
        name,
        status: "skip",
        message:
          "Credential decryption: no stored credentials yet — nothing to " +
          "verify the key against",
      };
    default:
      return {
        name,
        status: "skip",
        message:
          // No key yet (a DB-only start writes none) or no database up:
          // either way there is nothing to verify, and no alarm to raise.
          "Credential decryption: no ENCRYPTION_KEY or no database to read " +
          "yet — nothing to verify",
      };
  }
}

/** The key as the running app would see it: docker/.env, or app/.env.local. */
function readEncryptionKey(): string | undefined {
  const file =
    getMode() === "docker"
      ? join(paths.root, DOCKER_ENV_PATH)
      : paths.envFile;
  if (!existsSync(file)) return undefined;
  try {
    return parseEnv(readFileSync(file, "utf-8")).ENCRYPTION_KEY;
  } catch {
    return undefined;
  }
}

export function printResults(results: CheckResult[]): boolean {
  let hasFailure = false;
  for (const r of results) {
    if (r.status === "ok") {
      success(r.message);
    } else if (r.status === "skip") {
      // Not a problem and not a pass — say so rather than implying either.
      info(r.message);
    } else if (r.status === "warn") {
      warn(r.message);
    } else {
      logError(r.message);
      hasFailure = true;
    }
  }
  return hasFailure;
}
