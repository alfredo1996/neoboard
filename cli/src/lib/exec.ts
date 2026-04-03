import { execSync, spawn as nodeSpawn } from "node:child_process";
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

export function run(cmd: string, opts?: RunOptions): string {
  try {
    const result = execSync(cmd, {
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

export function spawn(
  cmd: string,
  args: string[],
  opts?: SpawnOptions,
): ChildProcess {
  return nodeSpawn(cmd, args, { stdio: "inherit", ...opts });
}
