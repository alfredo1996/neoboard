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
  usableConnectionNames,
  findClash,
  usableOrForbidden,
} from "@/lib/ontology/concepts";

const patchSchema = z.object(conceptFields);

type Ctx = { params: Promise<{ id: string }> };

/**
 * The concept, if the caller's tenant holds it and the caller can see a side of
 * it (an admin always can). One the caller cannot see answers like a missing
 * one, so an id reveals nothing. `mine` is the caller's scope: the connections
 * they can use, or undefined for an admin, who changes every side. Sides
 * outside it are left alone by an edit or delete (#2484). Whether the caller
 * still owns a side is decided again under the row lock in `lockedSides`.
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
  if (session.role === "admin") {
    return concept ? { mine: undefined } : { response: gone() };
  }
  if (!concept) return { response: gone() };
  const usable = (await usableConnectionNames(session)).map((c) => c.id);
  return { mine: usable };
}

const gone = () => notFound("Concept not found");

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

/**
 * Locks the concept row and reads its sides from that fresh state, so a side
 * another creator added meanwhile is seen (and kept) rather than cascaded away.
 * `undefined` when the concept is gone or, for a creator, holds none of theirs.
 */
async function lockedSides(
  tx: Tx,
  tenantId: string,
  id: string,
  mine?: string[],
) {
  const [concept] = await tx
    .select()
    .from(ontologyConcepts)
    .where(
      and(eq(ontologyConcepts.tenantId, tenantId), eq(ontologyConcepts.id, id)),
    )
    .for("update");
  if (!concept) return undefined;
  const sides = await tx
    .select()
    .from(ontologyConceptSides)
    .where(sidesIn(tenantId, id));
  const own = mine ? sides.filter((s) => mine.includes(s.connectionId)) : sides;
  return mine && own.length === 0 ? undefined : { sides, own };
}

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

    const saved = await db.transaction(async (tx) => {
      if (!(await lockedSides(tx, tenantId, id, found.mine))) return false;
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
      return true;
    });
    if (!saved) return gone();
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
    // concept, to the people who can (#2484). Decided under the row lock.
    const { tenantId } = session;
    const deleted = await db.transaction(async (tx) => {
      const locked = await lockedSides(tx, tenantId, id, found.mine);
      if (!locked) return false;
      await (locked.own.length < locked.sides.length
        ? tx
            .delete(ontologyConceptSides)
            .where(sidesIn(tenantId, id, found.mine))
        : tx
            .delete(ontologyConcepts)
            .where(
              and(
                eq(ontologyConcepts.tenantId, tenantId),
                eq(ontologyConcepts.id, id),
              ),
            ));
      return true;
    });
    if (!deleted) return gone();
    return apiSuccess({ id });
  } catch (error) {
    return conceptRouteError(error, "Failed to delete the concept");
  }
}
