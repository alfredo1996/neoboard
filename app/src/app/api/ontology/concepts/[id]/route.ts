import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { ontologyConcepts, ontologyConceptSides } from "@/lib/db/schema";
import { requireSession } from "@/lib/auth/session";
import { assertCanManageConnections } from "@/lib/auth/permissions";
import { apiError, apiSuccess } from "@/lib/api/api-response";
import {
  notFound,
  validateBody,
  readJsonBody,
  handleRouteError,
} from "@/lib/api/api-utils";
import {
  checkSidesAgainstTerms,
  conceptFields,
  findClash,
  usableOrForbidden,
} from "@/lib/ontology/concepts";

const patchSchema = z.object(conceptFields);

type Ctx = { params: Promise<{ id: string }> };

/**
 * The concept, if the caller's tenant holds it and the caller can use every
 * connection of its sides (an admin always can). Editing or deleting a
 * concept would otherwise drop sides the caller cannot even see.
 */
async function findManageable(
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
  if (!concept) return { response: notFound("Concept not found") };
  const sides = await db
    .select()
    .from(ontologyConceptSides)
    .where(
      and(
        eq(ontologyConceptSides.tenantId, tenantId),
        eq(ontologyConceptSides.conceptId, id),
      ),
    );
  const used = await usableOrForbidden(
    session,
    sides.map((s) => s.connectionId),
  );
  if (used.response) return { response: used.response };
  return { concept };
}

/**
 * PATCH /api/ontology/concepts/{id}
 *
 * Replaces a concept's name, parameter, description and sides, under the same
 * rules as creating one.
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

    const found = await findManageable(session, id);
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
        .where(
          and(
            eq(ontologyConceptSides.tenantId, tenantId),
            eq(ontologyConceptSides.conceptId, id),
          ),
        );
      await tx
        .insert(ontologyConceptSides)
        .values(sides.map((s) => ({ tenantId, conceptId: id, ...s })));
    });
    return apiSuccess({ id, ...fields, sides });
  } catch (error) {
    return handleRouteError(error, "Failed to save the concept");
  }
}

/** DELETE /api/ontology/concepts/{id}: the concept and, by cascade, its sides. */
export async function DELETE(_request: Request, { params }: Ctx) {
  try {
    const session = await requireSession();
    assertCanManageConnections(session.role);
    const { id } = await params;
    const found = await findManageable(session, id);
    if (found.response) return found.response;
    await db
      .delete(ontologyConcepts)
      .where(
        and(
          eq(ontologyConcepts.tenantId, session.tenantId),
          eq(ontologyConcepts.id, id),
        ),
      );
    return apiSuccess({ id });
  } catch (error) {
    return handleRouteError(error, "Failed to delete the concept");
  }
}
