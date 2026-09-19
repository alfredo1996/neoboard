import { getAllConnectors, toDescriptor } from "@neoboard/connection";
import { requireSession } from "@/lib/auth/session";
import { handleRouteError } from "@/lib/api/api-utils";
import { apiSuccess } from "@/lib/api/api-response";

/**
 * GET /api/connectors (#1899)
 *
 * Every registered connector as plain data — label, category, icon, query
 * language, fields. The registry pulls in database drivers and cannot be
 * bundled, so this is how the browser learns which connectors exist: nothing
 * in `app/` or `component/` names one.
 *
 * `toDescriptor` copies only the keys the contract declares, so no function
 * and no driver object an author hung on a plugin can ride along.
 *
 * It reads the in-process registry and touches no database: there is no
 * tenant filter to write, and the answer is the same for every tenant. A
 * session is still required — what is installed is nobody else's business.
 */
export async function GET() {
  try {
    await requireSession();
    return apiSuccess(getAllConnectors().map(toDescriptor), 200, null, {
      // The registry is fixed at build time, so this cannot change under a
      // running server. `private`: it sits behind a session, keep it out of
      // shared caches.
      "Cache-Control": "private, max-age=300",
    });
  } catch (e) {
    return handleRouteError(e, "Failed to list connectors");
  }
}
