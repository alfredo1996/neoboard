import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  ontologyConcepts,
  ontologyConceptSides,
  ontologyTerms,
} from "@/lib/db/schema";
import { requireSession } from "@/lib/auth/session";
import { apiSuccess } from "@/lib/api/api-response";
import {
  usableConnectionNames,
  conceptRouteError,
} from "@/lib/ontology/concepts";
import {
  ONTOLOGY_FORMAT,
  ONTOLOGY_VERSION,
} from "@/lib/ontology/import-export";

/**
 * GET /api/ontology/export (#2510)
 *
 * The whole Model as one file: the terms someone described, for every
 * connection the caller can use, and the concepts with only their sides on
 * those connections (a concept left with none is out, except for an admin).
 * Never the structure, a connection's settings, a credential or a tenant id.
 */
export async function GET() {
  try {
    const session = await requireSession();
    const { tenantId } = session;
    const usable = await usableConnectionNames(session);
    const ids = usable.map((c) => c.id);
    const [terms, concepts, sides] = await Promise.all([
      ids.length
        ? db
            .select()
            .from(ontologyTerms)
            .where(
              and(
                eq(ontologyTerms.tenantId, tenantId),
                inArray(ontologyTerms.connectionId, ids),
              ),
            )
        : Promise.resolve([]),
      db
        .select()
        .from(ontologyConcepts)
        .where(eq(ontologyConcepts.tenantId, tenantId)),
      db
        .select()
        .from(ontologyConceptSides)
        .where(eq(ontologyConceptSides.tenantId, tenantId)),
    ]);
    const usableIds = new Set(ids);
    const visible = sides.filter((s) => usableIds.has(s.connectionId));
    return apiSuccess({
      format: ONTOLOGY_FORMAT,
      version: ONTOLOGY_VERSION,
      connections: usable.map((c) => ({
        id: c.id,
        name: c.name,
        terms: terms
          .filter((t) => t.connectionId === c.id)
          .map(
            ({ kind, key, parentKey, displayName, description, hidden }) => ({
              kind,
              key,
              parentKey,
              displayName,
              description,
              hidden,
            }),
          ),
      })),
      concepts: concepts
        .map((c) => ({
          name: c.name,
          parameter: c.parameter,
          description: c.description,
          sides: visible
            .filter((s) => s.conceptId === c.id)
            .map(({ connectionId, entityKey, keyPropertyKey }) => ({
              connectionId,
              entityKey,
              keyPropertyKey,
            })),
        }))
        .filter((c) => c.sides.length > 0 || session.role === "admin"),
    });
  } catch (error) {
    return conceptRouteError(error, "Failed to export the model");
  }
}
