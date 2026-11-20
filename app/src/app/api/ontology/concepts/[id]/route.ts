import { z } from "zod";
import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/lib/db";
import { ontologyConcepts, ontologyConceptSides } from "@/lib/db/schema";
import { requireSession } from "@/lib/auth/session";
import { assertCanManageConnections } from "@/lib/auth/permissions";
import { apiError, apiSuccess } from "@/lib/api/api-response";
import { notFound, validateBody, readJsonBody } from "@/lib/api/api-utils";
import {
  checkSidesAgainstTerms,
  conceptFields,
  conceptRouteError,
  usableConnections,
  findClash,
  usableOrForbidden,
} from "@/lib/ontology/concepts";

const patchSchema = z.object(conceptFields);

type Ctx = { params: Promise<{ id: string }> };

/**
 * The concept, if the caller's tenant holds it and the caller can see a side of
 * it (an admin always can). One the caller cannot see answers like a missing
 * one, so an id reveals nothing. `mine` is the caller's scope: the connections
 * they can use, or undefined for an admin, who changes every side. `hidden`
 * counts the sides outside it, which an edit or delete leaves alone (#2484).
 */
async function findVisible(
  session: Awaited<ReturnType<typeof requireSession>>,
  id: string,
) {
  const { tenantId } = session;
  const [concept] = await db
    .select()
    .from(ontologyConcepts)
    .where(
      and(eq(ontologyConcepts.tenantId, tenantId), eq(ontologyConcepts.id, id)),
    )
    .limit(1);
  const sides = concept
    ? await db
        .select()
        .from(ontologyConceptSides)
        .where(
          and(
            eq(ontologyConceptSides.tenantId, tenantId),
            eq(ontologyConceptSides.conceptId, id),
          ),
        )
    : [];
  if (session.role === "admin") {
    return concept ? { mine: undefined, hidden: 0 } : { response: gone() };
  }
  const usable = new Set((await usableConnections(session)).map((c) => c.id));
  const mine = [...usable].filter((c) =>
    sides.some((s) => s.connectionId === c),
  );
  if (!concept || mine.length === 0) return { response: gone() };
  return {
    mine,
    hidden: sides.filter((s) => !usable.has(s.connectionId)).length,
  };
}

const gone = () => notFound("Concept not found");

/** The sides of concept `id` the caller's scope covers. */
const sidesIn = (tenantId: string, id: string, mine?: string[]) =>
  and(
    eq(ontologyConceptSides.tenantId, tenantId),
    eq(ontologyConceptSides.conceptId, id),
    mine && inArray(ontologyConceptSides.connectionId, mine),
  );

/**
 * PATCH /api/ontology/concepts/{id}
 *
 * Replaces a concept's name, parameter, description and its sides on
 * connections the caller can use, under the same rules as creating one. Sides
 * on other connections stay as they are.
 */
export async function PATCH(request: Request, { params }: Ctx) {
  try {
    const session = await requireSession();
    assertCanManageConnections(session.role);
    const { id } = await params;
    const validation = validateBody(patchSchema, await readJsonBody(request));
    if (!validation.success) return validation.response;
    const { sides, ...fields } = validation.data;
    const { tenantId } = session;

    const found = await findVisible(session, id);
    if (found.response) return found.response;
    const used = await usableOrForbidden(
      session,
      sides.map((s) => s.connectionId),
    );
    if (used.response) return used.response;
    const bad = await checkSidesAgainstTerms(sides, used.usable);
    if (bad) return bad;
    const clash = await findClash(tenantId, fields, id);
    if (clash) return apiError("CONFLICT", clash);

    await db.transaction(async (tx) => {
      await tx
        .update(ontologyConcepts)
        .set(fields)
        .where(
          and(
            eq(ontologyConcepts.tenantId, tenantId),
            eq(ontologyConcepts.id, id),
          ),
        );
      await tx
        .delete(ontologyConceptSides)
        .where(sidesIn(tenantId, id, found.mine));
      await tx
        .insert(ontologyConceptSides)
        .values(sides.map((s) => ({ tenantId, conceptId: id, ...s })));
    });
    return apiSuccess({ id, ...fields, sides });
  } catch (error) {
    return conceptRouteError(error, "Failed to save the concept");
  }
}

/**
 * DELETE /api/ontology/concepts/{id}: an admin, or a creator when every side is
 * theirs, deletes the concept and, by cascade, its sides; otherwise only the
 * creator's own sides go.
 */
export async function DELETE(_request: Request, { params }: Ctx) {
  try {
    const session = await requireSession();
    assertCanManageConnections(session.role);
    const { id } = await params;
    const found = await findVisible(session, id);
    if (found.response) return found.response;
    // A creator leaves the sides on connections they cannot use, and so the
    // concept, to the people who can (#2484).
    await (found.hidden > 0
      ? db
          .delete(ontologyConceptSides)
          .where(sidesIn(session.tenantId, id, found.mine))
      : db
          .delete(ontologyConcepts)
          .where(
            and(
              eq(ontologyConcepts.tenantId, session.tenantId),
              eq(ontologyConcepts.id, id),
            ),
          ));
    return apiSuccess({ id });
  } catch (error) {
    return conceptRouteError(error, "Failed to delete the concept");
  }
}
