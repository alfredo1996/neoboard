import { existsSync } from "node:fs";

/**
 * Is this process running inside a container?
 *
 * Used to tell two identical-looking failures apart: a connection to
 * `localhost` that fails from the host is a real network problem, while the
 * same failure from inside a container usually means `localhost` resolved to
 * the container rather than the user's machine (#1346).
 *
 * `/.dockerenv` is written by the Docker runtime and is the cheap, stable
 * signal. Evaluated once — the answer cannot change while the process runs,
 * and this is called from an error path.
 */
let cached: boolean | undefined;

export function isContainerised(): boolean {
  cached ??= existsSync("/.dockerenv");
  return cached;
}

/** @internal — test-only, since the answer is cached for the process lifetime. */
export function _resetContainerisedCache(): void {
  cached = undefined;
}
