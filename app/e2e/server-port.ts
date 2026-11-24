import * as http from "node:http";
import { execFileSync } from "node:child_process";
import type { EventEmitter } from "node:events";

/** nextcov's CDP port is the server port plus this (#1606). */
export const CDP_OFFSET = 6130;
// Below Linux's ephemeral range (32768+), and low enough that port + CDP_OFFSET
// stays a valid port.
const PICK_MIN = 20_000;
const PICK_SPAN = 12_000;

/**
 * True when nothing is listening on `port`. Probed in a child process so the
 * Playwright config, which must be synchronous, can call it.
 */
export function isPortFree(port: number): boolean {
  try {
    execFileSync(
      process.execPath,
      [
        "-e",
        "const s=require('node:net').createServer();s.on('error',()=>process.exit(1));s.listen(+process.argv[1],()=>s.close());",
        String(port),
      ],
      { stdio: "ignore" },
    );
    return true;
  } catch {
    return false;
  }
}

/**
 * The server port for this run. Unset: a random port whose CDP partner is also
 * free, written to `env` so the config, global setup, workers and teardown all
 * read one value. Playwright runs the config in the runner and again in each
 * worker, which inherits the env, so only the first call picks.
 */
export function resolveServerPort(
  env: NodeJS.ProcessEnv = process.env,
  random: () => number = Math.random,
  portFree: (port: number) => boolean = isPortFree,
): number {
  const explicit = Number.parseInt(env.TEST_SERVER_PORT ?? "", 10);
  if (explicit > 0) return explicit;
  for (let i = 0; i < 100; i++) {
    const port = PICK_MIN + Math.floor(random() * PICK_SPAN);
    if (portFree(port) && portFree(port + CDP_OFFSET)) {
      env.TEST_SERVER_PORT = String(port);
      return port;
    }
  }
  throw new Error("No free TEST_SERVER_PORT pair found after 100 tries");
}

/** Fail before spawn when the server port or its CDP port already has a listener. */
export function assertServerPortsFree(
  port: number,
  portFree: (port: number) => boolean = isPortFree,
): void {
  for (const p of [port, port + CDP_OFFSET]) {
    if (!portFree(p)) {
      throw new Error(
        `Port ${p} is already in use (server port ${port}, CDP port ${port + CDP_OFFSET}). ` +
          `Another E2E run or process owns it; find it with: lsof -nP -iTCP:${p} -sTCP:LISTEN. ` +
          `Unset TEST_SERVER_PORT to pick a free port automatically.`,
      );
    }
  }
}

/**
 * Resolve when the spawned server answers on `port`; reject at once, with its
 * exit code and stderr tail, if the server exits first. A bare HTTP answer is
 * not enough: another run's server on the same port would satisfy it, so the
 * first answer is only trusted after `graceMs`.
 */
export function waitForServer(
  port: number,
  child: EventEmitter,
  stderrTail: () => string,
  timeoutMs: number,
  pollMs = 500,
  graceMs = 2_000,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const start = Date.now();
    let timer: NodeJS.Timeout | undefined;
    let done = false;
    const finish = (err?: Error) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      child.off("exit", onExit);
      if (err) reject(err);
      else resolve();
    };
    const onExit = (code: number | null, signal: string | null) =>
      finish(
        new Error(
          `Next.js server exited during startup (code ${code ?? signal}) before answering on port ${port}.\n${stderrTail()}`,
        ),
      );
    child.once("exit", onExit);
    // A server that lost the bind race exits within a few hundred ms, while the
    // foreign listener that beat it answers at once. Give the exit time to land
    // before trusting a first answer; a real Next.js start takes longer anyway.
    const check = () => {
      const req = http.get(`http://localhost:${port}/`, (res) => {
        res.resume();
        finish();
      });
      req.on("error", () => {
        if (done) return;
        if (Date.now() - start > timeoutMs) {
          finish(new Error(`Port ${port} not available after ${timeoutMs}ms`));
        } else {
          timer = setTimeout(check, pollMs);
        }
      });
    };
    timer = setTimeout(check, graceMs);
  });
}
