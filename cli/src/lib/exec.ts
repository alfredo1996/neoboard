import { execSync, execFileSync, spawn as nodeSpawn } from "node:child_process";
import type { SpawnOptions, ChildProcess } from "node:child_process";

/**
 * Scrub credentials from text that may end up in error messages, stack
 * traces, or pasted terminal output (#967): `-p <pw>` style flags,
 * `key=value` secrets, and userinfo passwords in connection strings.
 */
export function redactSecrets(text: string): string {
  return text
    .replace(/((?:^|\s)(?:-p|--password))(\s+)(\S+)/g, "$1$2***")
    .replace(
      /\b((?:password|passwd|pwd|secret|token|access_token|api_key)=)([^\s'"&]+)/gi,
      "$1***",
    )
    .replace(/(:\/\/[^/:\s@]+:)([^@\s]+)(@)/g, "$1***$3");
}

export class ExecError extends Error {
  public readonly cmd: string;
  public readonly stderr: string;

  constructor(
    cmd: string,
    public readonly exitCode: number,
    stderr: string,
  ) {
    // Redact at construction so no consumer (message, stack, .cmd, .stderr)
    // can leak credentials — demo/seed rethrow these uncaught (#967).
    const safeCmd = redactSecrets(cmd);
    const safeStderr = redactSecrets(stderr);
    super(`Command failed (exit ${exitCode}): ${safeCmd}\n${safeStderr}`);
    this.name = "ExecError";
    this.cmd = safeCmd;
    this.stderr = safeStderr;
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
      // NOSONAR: CLI tool — all commands are hardcoded, no user input
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

/**
 * runFile, returning null instead of throwing. The argv counterpart to
 * runOrNull, for commands whose arguments must not pass through a shell —
 * anything carrying quoted SQL identifiers, paths, or user-supplied values.
 */
export function runFileOrNull(
  file: string,
  args: string[],
  opts?: RunOptions,
): string | null {
  try {
    return runFile(file, args, opts);
  } catch {
    return null;
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
 * Execute a command with an explicit argument array and NO shell (execFile).
 *
 * Security: unlike `run()`, arguments are passed to the process directly, so a
 * value like a package name is a single argv element that can never be
 * re-parsed by a shell — this is how the plugin commands install arbitrary
 * user-supplied specs (names, scoped names, versions, file:/git URLs) without
 * risking command injection. POSIX-first, consistent with the rest of the CLI.
 */
export function runFile(
  file: string,
  args: string[],
  opts?: RunOptions,
): string {
  try {
    const result = execFileSync(file, args, {
      cwd: opts?.cwd,
      env: opts?.env ?? process.env,
      timeout: opts?.timeout,
      encoding: "utf-8",
      stdio: ["pipe", "pipe", "pipe"],
    });
    return result.trim();
  } catch (err: unknown) {
    const e = err as { status?: number; stderr?: string | Buffer };
    throw new ExecError(
      [file, ...args].join(" "),
      e.status ?? 1,
      String(e.stderr ?? "").trim(),
    );
  }
}

/**
 * Execute a command inside a Docker container.
 *
 * Uses execSync with shell so quoted arguments (e.g. Cypher queries)
 * are preserved. Input is NOT user-provided — all commands are
 * hardcoded CLI strings from the seed/migrate commands.
 *
 * Security (S4036): "docker" is resolved via PATH intentionally — this is a
 * local developer CLI tool, not a server process. PATH is trusted.
 */
export function dockerExec(
  container: string,
  cmd: string,
  opts?: { env?: Record<string, string> },
): string {
  // Secrets are forwarded by NAME only (`-e VAR`); the docker CLI reads the
  // value from its own environment, so it never appears in host argv (#967).
  const envFlags = opts?.env
    ? Object.keys(opts.env)
        .map((k) => `-e ${k} `)
        .join("")
    : "";
  // NOSONAR — CLI tool, all commands are hardcoded constants
  const fullCmd = `docker exec ${envFlags}${container} ${cmd}`;
  try {
    const result = execSync(fullCmd, {
      encoding: "utf-8",
      stdio: ["pipe", "pipe", "pipe"],
      env: opts?.env ? { ...process.env, ...opts.env } : process.env,
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
