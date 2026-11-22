import { z } from "zod";
import { db } from "@/lib/db";
import { requireSession } from "@/lib/auth/session";
import { assertCanManageConnections } from "@/lib/auth/permissions";
import { apiSuccess } from "@/lib/api/api-response";
import { badRequest, readJsonBody } from "@/lib/api/api-utils";
import {
  conceptRouteError,
  liveTermsById,
  usableConnectionNames,
  usableOrForbidden,
} from "@/lib/ontology/concepts";
import {
  parseOntologyFile,
  planImport,
  writePlan,
} from "@/lib/ontology/import-export";

const requestSchema = z.object({
  payload: z.unknown(),
  connectionMapping: z.record(z.string(), z.string()).default({}),
  /** False (the default) previews; true writes. */
  apply: z.boolean().default(false),
});

/**
 * POST /api/ontology/import (#2510)
 *
 * Previews, or with `apply: true` writes, an ontology file. `connectionMapping`
 * pairs each connection in the file with one here, as a dashboard import does;
 * one left out is skipped. Creators and admins who can use every mapped
 * connection only. The file wins for what it holds and nothing absent from it
 * is deleted; a key the live structure no longer has is written (and shown as
 * orphaned). The tenant is the session's, never the file's.
 */
export async function POST(request: Request) {
  try {
    const session = await requireSession();
    assertCanManageConnections(session.role);
    const body = requestSchema.safeParse(await readJsonBody(request));
    if (!body.success) {
      return badRequest(
        body.error.issues[0]?.message ?? "Invalid request body",
      );
    }
    const { payload, connectionMapping, apply } = body.data;
    const parsed = parseOntologyFile(payload);
    if ("error" in parsed) return badRequest(parsed.error);
    const { file } = parsed;

    const unknown = Object.keys(connectionMapping).find(
      (k) => !file.connections.some((c) => c.id === k),
    );
    if (unknown !== undefined) {
      return badRequest(`Connection "${unknown}" is not in the file`);
    }
    const targets = Object.values(connectionMapping).filter(Boolean);
    const used = await usableOrForbidden(
      session,
      targets,
      "You cannot use every connection you mapped",
    );
    if (used.response) return used.response;

    const { tenantId } = session;
    // Read before any transaction opens: the live terms come from the
    // external databases. A creator only matches concepts with a side on a
    // connection they can use; an admin matches them all.
    const live = await liveTermsById(used.usable);
    const visibleTo =
      session.role === "admin"
        ? undefined
        : new Set((await usableConnectionNames(session)).map((c) => c.id));
    const run = async (h: Parameters<typeof planImport>[0]) =>
      planImport(h, tenantId, file, connectionMapping, live, visibleTo);
    if (!apply) {
      return apiSuccess({ applied: false, preview: (await run(db)).preview });
    }
    const preview = await db.transaction(async (tx) => {
      const plan = await run(tx);
      await writePlan(tx, tenantId, plan);
      return plan.preview;
    });
    return apiSuccess({ applied: true, preview });
  } catch (error) {
    return conceptRouteError(error, "Failed to import the model");
  }
}
