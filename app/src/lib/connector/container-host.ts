import { isContainerised } from "./is-containerised";

/**
 * Rewrite a loopback host to `host.docker.internal` when we are containerised.
 *
 * From inside a container, `localhost` is the container — so a loopback
 * database URI is never a useful target in this deployment, and the user
 * almost always meant "the machine NeoBoard runs on". Explaining that in an
 * error message was the first half of #1346; this makes it work.
 *
 * Not a silent lie: the stored connection keeps exactly what the user typed,
 * and this applies only at the moment a driver is built. On Linux the rewritten
 * host resolves only when the stack was started with `--expose-host`, and the
 * failure then still classifies as container_loopback because callers classify
 * against the ORIGINAL uri — so the hint naming that flag still fires.
 *
 * Untouched outside a container: in local mode the app runs on the host, where
 * `localhost` is exactly right.
 */
export const CONTAINER_HOST_ALIAS = "host.docker.internal";

const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);

export function resolveContainerHost(uri: string): string {
  if (!uri || !isContainerised()) return uri;
  let parsed: URL;
  try {
    parsed = new URL(uri);
  } catch {
    // Unparseable: leave it alone and let the driver report it. Rewriting a
    // string we do not understand is how a bad URI becomes a confusing one.
    return uri;
  }
  if (!LOOPBACK_HOSTS.has(parsed.hostname.toLowerCase())) return uri;
  parsed.hostname = CONTAINER_HOST_ALIAS;
  return parsed.toString();
}
