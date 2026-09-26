import type { UserRole } from "@/lib/db/schema";
import { ForbiddenError } from "./errors";

/**
 * Connection management (create, update, inline test/introspection, delete)
 * is denied to readers: a connection points NeoBoard's server at an arbitrary
 * host:port with arbitrary credentials, which makes it an SSRF / internal
 * network probing surface — not something the lowest-privilege role may do
 * (#971). Delete is denied too, though it probes nothing: readers make no
 * destructive writes, as the dashboard `canWrite` gate already holds, and a
 * demoted owner keeps their connections (#1995). Creators and admins build
 * dashboards, so they may manage connections; per-connection
 * sharing/visibility is tracked in #901.
 */
export function assertCanManageConnections(role: UserRole): void {
  if (role === "reader") {
    throw new ForbiddenError();
  }
}
