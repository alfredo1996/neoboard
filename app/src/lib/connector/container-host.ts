import { isContainerised } from "./is-containerised";
import { hostAliasResolves } from "./host-alias";

/**
 * Rewrite a loopback host to `host.docker.internal` when we are containerised.
 *
 * From inside a container, `localhost` is the container — so a loopback
 * database URI is never a useful target in this deployment, and the user
 * almost always meant "the machine NeoBoard runs on". Explaining that in an
 * error message was the first half of #1346; this makes it work.
 *
 * Not a silent lie: the stored connection keeps exactly what the user typed,
 * and this applies only at the moment a driver is built.
 *
 * Skipped when the alias does not resolve — Linux without `--expose-host`.
 * Rewriting there would turn ECONNREFUSED into ENOTFOUND for a hostname the
 * user never typed, which is a WORSE error than the one this fixes, and it
 * would suppress the container_loopback hint that names the flag (#1348).
 *
 * Untouched outside a container: in local mode the app runs on the host, where
 * `localhost` is exactly right.
 */
export const CONTAINER_HOST_ALIAS = "host.docker.internal";

const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);

export async function resolveContainerHost(uri: string): Promise<string> {
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
  // Checked LAST: the lookup is cached for the process, but there is no reason
  // to reach for it on the overwhelming majority of URIs that are not loopback.
  if (!(await hostAliasResolves())) return uri;
  parsed.hostname = CONTAINER_HOST_ALIAS;
  return parsed.toString();
}
