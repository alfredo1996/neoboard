import { z } from "zod";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { ontologyConcepts, ontologyConceptSides } from "@/lib/db/schema";
import { randomId } from "@/lib/random-id";
import { requireSession } from "@/lib/auth/session";
import { assertCanManageConnections } from "@/lib/auth/permissions";
import { apiError, apiSuccess } from "@/lib/api/api-response";
import { validateBody, readJsonBody } from "@/lib/api/api-utils";
import {
  checkSidesAgainstTerms,
  conceptFields,
  conceptRouteError,
  findClash,
  flagSides,
  liveTermsById,
  usableConnections,
  usableOrForbidden,
} from "@/lib/ontology/concepts";

const postSchema = z.object(conceptFields);

/**
 * GET /api/ontology/concepts (#2484)
 *
 * Every concept of the caller's tenant, each with only its sides on
 * connections the caller can use; a concept with none is hidden, except from
 * an admin, who sees all. A side whose entity or key property the connection no
 * longer reports is flagged `missing`, per read.
 */
export async function GET() {
  try {
    const session = await requireSession();
    const { tenantId } = session;
    const [concepts, sides, usable] = await Promise.all([
      db
        .select()
        .from(ontologyConcepts)
        .where(eq(ontologyConcepts.tenantId, tenantId))
        .orderBy(ontologyConcepts.name),
      db
        .select()
        .from(ontologyConceptSides)
        .where(eq(ontologyConceptSides.tenantId, tenantId)),
      usableConnections(session),
    ]);
    const usableIds = new Set(usable.map((c) => c.id));
    const visible = sides.filter((s) => usableIds.has(s.connectionId));
    const used = new Set(visible.map((s) => s.connectionId));
    const live = await liveTermsById(usable.filter((c) => used.has(c.id)));
    const out = concepts
      .map((c) => ({
        id: c.id,
        name: c.name,
        parameter: c.parameter,
        description: c.description,
        // Some side is out of the caller's sight: all a creator learns of it,
        // to word a delete (it removes only their sides).
        partial: sides.some(
          (s) => s.conceptId === c.id && !usableIds.has(s.connectionId),
        ),
        sides: flagSides(
          visible
            .filter((s) => s.conceptId === c.id)
            .map(({ connectionId, entityKey, keyPropertyKey }) => ({
              connectionId,
              entityKey,
              keyPropertyKey,
            })),
          live,
        ),
      }))
      .filter((c) => c.sides.length > 0 || session.role === "admin");
    return apiSuccess({ concepts: out });
  } catch (error) {
    return conceptRouteError(error, "Failed to read the concepts");
  }
}

/**
 * POST /api/ontology/concepts
 *
 * Creates a concept. A creator or admin who can use every side's connection;
 * each side's entity and key property must be on that connection now. Name and
 * parameter are unique per tenant.
 */
export async function POST(request: Request) {
  try {
    const session = await requireSession();
    assertCanManageConnections(session.role);
    const validation = validateBody(postSchema, await readJsonBody(request));
    if (!validation.success) return validation.response;
    const { sides, ...fields } = validation.data;
    const { tenantId } = session;

    const used = await usableOrForbidden(
      session,
      sides.map((s) => s.connectionId),
    );
    if (used.response) return used.response;
    const bad = await checkSidesAgainstTerms(sides, used.usable);
    if (bad) return bad;

    const clash = await findClash(tenantId, fields);
    if (clash) return apiError("CONFLICT", clash);

    const id = randomId();
    await db.transaction(async (tx) => {
      await tx.insert(ontologyConcepts).values({ id, tenantId, ...fields });
      await tx
        .insert(ontologyConceptSides)
        .values(sides.map((s) => ({ tenantId, conceptId: id, ...s })));
    });
    return apiSuccess({ id, ...fields, sides }, 201);
  } catch (error) {
    return conceptRouteError(error, "Failed to save the concept");
  }
}
