import { lookup } from "node:dns/promises";
import { CONTAINER_HOST_ALIAS } from "./container-host";

/**
 * Does `host.docker.internal` actually resolve here?
 *
 * The rewrite in [[container-host]] is only an improvement when the alias
 * resolves. Where it does not — Linux without `--expose-host` — substituting it
 * turns ECONNREFUSED into ENOTFOUND for a hostname the user never typed, which
 * is a *worse* error than the one the rewrite exists to fix, and it also
 * suppresses the `container_loopback` hint that would have told them about the
 * flag (#1348).
 *
 * Docker Desktop provides the alias through its embedded DNS and does NOT put
 * it in /etc/hosts, so reading that file would report "unresolvable" on the one
 * platform where the rewrite already works. It has to be a real lookup.
 *
 * Resolved once per process: the answer is a property of how the container was
 * started and cannot change while it runs, and this sits on the connection
 * path.
 */
let probe: Promise<boolean> | undefined;

export function hostAliasResolves(): Promise<boolean> {
  probe ??= lookup(CONTAINER_HOST_ALIAS)
    .then(() => true)
    .catch(() => false);
  return probe;
}

/** @internal — test-only, since the probe is cached for the process lifetime. */
export function _resetHostAliasCache(): void {
  probe = undefined;
}
