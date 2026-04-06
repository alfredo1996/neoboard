import { execSync, execFileSync, spawn as nodeSpawn } from "node:child_process";
import type { SpawnOptions, ChildProcess } from "node:child_process";

export class ExecError extends Error {
  constructor(
    public readonly cmd: string,
    public readonly exitCode: number,
    public readonly stderr: string,
  ) {
    super(`Command failed (exit ${exitCode}): ${cmd}\n${stderr}`);
    this.name = "ExecError";
  }
}

export interface RunOptions {
  cwd?: string;
  env?: NodeJS.ProcessEnv;
  timeout?: number;
}

/**
 * Execute a shell command synchronously and return stdout.
 *
 * Security: All commands are hardcoded CLI invocations (docker, npm, npx, node).
 * No user input is interpolated into the command string. This is a CLI tool
 * that runs locally on the developer's machine, not a server-side API.
 */
export function run(cmd: string, opts?: RunOptions): string {
  try {
    const result = execSync(cmd, {
      // NOSONAR: CLI tool — all commands are hardcoded constants, no user input interpolation
      cwd: opts?.cwd,
      env: opts?.env ?? process.env,
      timeout: opts?.timeout,
      encoding: "utf-8",
      stdio: ["pipe", "pipe", "pipe"],
    });
    return result.trim();
  } catch (err: unknown) {
    const e = err as { status?: number; stderr?: string | Buffer };
    throw new ExecError(cmd, e.status ?? 1, String(e.stderr ?? "").trim());
  }
}

export function runOrNull(cmd: string, opts?: RunOptions): string | null {
  try {
    return run(cmd, opts);
  } catch {
    return null;
  }
}

/**
 * Execute a command inside a Docker container.
 *
 * Uses execSync with shell so quoted arguments (e.g. Cypher queries)
 * are preserved. Input is NOT user-provided — all commands are
 * hardcoded CLI strings from the seed/migrate commands.
 */
export function dockerExec(container: string, cmd: string): string {
  // NOSONAR — CLI tool, all commands are hardcoded constants
  const fullCmd = `docker exec ${container} ${cmd}`;
  try {
    const result = execSync(fullCmd, {
      encoding: "utf-8",
      stdio: ["pipe", "pipe", "pipe"],
    });
    return result.trim();
  } catch (err: unknown) {
    const e = err as { status?: number; stderr?: string | Buffer };
    throw new ExecError(fullCmd, e.status ?? 1, String(e.stderr ?? "").trim());
  }
}

export function spawn(
  cmd: string,
  args: string[],
  opts?: SpawnOptions,
): ChildProcess {
  return nodeSpawn(cmd, args, { stdio: "inherit", ...opts });
}
