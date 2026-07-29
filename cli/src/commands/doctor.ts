import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { parse as parseEnv } from "dotenv";
import { runOrNull } from "../lib/exec.js";
import { isPortAvailable } from "../lib/ports.js";
import { paths, readProjectConfig, getMode } from "../lib/config.js";
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

export async function runDoctor(): Promise<CheckResult[]> {
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

  const portChecks = await Promise.all([
    checkPortAvailable(config.ports.postgres, "PostgreSQL"),
    checkPortAvailable(config.ports.neo4j_http, "Neo4j HTTP"),
    checkPortAvailable(config.ports.neo4j_bolt, "Neo4j Bolt"),
    checkPortAvailable(config.ports.app, "App"),
  ]);
  results.push(...portChecks);

  results.push(checkNodeModulesExist());
  results.push(checkEnvFileExists());
  results.push(await checkCredentialDecryption());

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
          "Credential decryption: could not read the database — check the " +
          "PostgreSQL result above first",
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
