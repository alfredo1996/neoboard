import { createHash } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { getConnector } from "@neoboard/connection";
import { db } from "@/lib/db";
import {
  ontologyConcepts,
  ontologyConceptSides,
  ontologyTerms,
} from "@/lib/db/schema";
import type { UserRole } from "@/lib/db/schema";
import {
  flagSides,
  liveTermsById,
  usableConnections,
} from "@/lib/ontology/concepts";
import { mergeTerms } from "@/lib/ontology/merge";

type Session = { userId: string; role: UserRole; tenantId: string };

export interface GroundingSide {
  entityKey: string;
  keyPropertyKey: string;
}

export interface GroundingOtherSide extends GroundingSide {
  connectionId: string;
  connectionName: string;
  /** From the connector's descriptor, never from the connection's type. */
  queryLanguage: string;
}

export interface GroundingModel {
  /** A hash of everything below: changes when any field does, not with read order. */
  version: string;
  connection: { id: string; name: string; queryLanguage: string };
  terms: Array<{
    kind: string;
    key: string;
    parentKey: string;
    type?: string;
    displayName: string;
    description: string;
  }>;
  concepts: Array<{
    name: string;
    description: string;
    /** `$param_<name>`, the token every connector takes. */
    parameter: string;
    sides: GroundingSide[];
    otherSides: GroundingOtherSide[];
  }>;
}

const byKey = (a: readonly string[], b: readonly string[]) => {
  const x = JSON.stringify(a);
  const y = JSON.stringify(b);
  if (x === y) return 0;
  return x < y ? -1 : 1;
};

const languageOf = (type: string) => getConnector(type)?.queryLanguage ?? "";

/**
 * A connection's model ready to go into a prompt (#2574): its live, visible
 * terms and the concepts with a live side on it, each with its other sides on
 * connections the caller can use. `null` when the caller cannot use the
 * connection (another tenant's, or not shared with them). Independent of read
 * order: the same model gives the same bytes and the same version. A
 * connection whose structure cannot be read says nothing about its sides, so
 * they stay, as the concepts route does.
 */
export async function getGroundingModel(
  session: Session,
  connectionId: string,
): Promise<GroundingModel | null> {
  const { tenantId } = session;
  const usable = await usableConnections(session);
  const here = usable.find((c) => c.id === connectionId);
  if (!here) return null;

  const [stored, concepts, sides] = await Promise.all([
    db
      .select()
      .from(ontologyTerms)
      .where(
        and(
          eq(ontologyTerms.tenantId, tenantId),
          eq(ontologyTerms.connectionId, connectionId),
        ),
      ),
    db
      .select()
      .from(ontologyConcepts)
      .where(eq(ontologyConcepts.tenantId, tenantId)),
    db
      .select()
      .from(ontologyConceptSides)
      .where(eq(ontologyConceptSides.tenantId, tenantId)),
  ]);

  const usableIds = new Set(usable.map((c) => c.id));
  const visible = sides.filter((s) => usableIds.has(s.connectionId));
  const mapped = new Set(visible.map((s) => s.connectionId));
  mapped.add(connectionId);
  const live = await liveTermsById(usable.filter((c) => mapped.has(c.id)));
  const byId = new Map(usable.map((c) => [c.id, c]));

  const terms = mergeTerms(live.get(connectionId) ?? [], stored)
    .filter((t) => !t.orphaned && !t.hidden)
    .map((t) => ({
      kind: t.kind,
      key: t.key,
      parentKey: t.parentKey,
      type: t.type,
      displayName: t.displayName,
      description: t.description,
    }))
    .sort((a, b) =>
      byKey([a.kind, a.key, a.parentKey], [b.kind, b.key, b.parentKey]),
    );

  const outConcepts = concepts
    .flatMap((c) => {
      const reported = flagSides(
        visible
          .filter((s) => s.conceptId === c.id)
          .map((s) => ({
            connectionId: s.connectionId,
            entityKey: s.entityKey,
            keyPropertyKey: s.keyPropertyKey,
          })),
        live,
      ).filter((s) => !s.missing);
      const mine = reported.filter((s) => s.connectionId === connectionId);
      if (mine.length === 0) return [];
      return [
        {
          name: c.name,
          description: c.description,
          parameter: `$param_${c.parameter}`,
          sides: mine
            .map((s) => ({
              entityKey: s.entityKey,
              keyPropertyKey: s.keyPropertyKey,
            }))
            .sort((a, b) =>
              byKey(
                [a.entityKey, a.keyPropertyKey],
                [b.entityKey, b.keyPropertyKey],
              ),
            ),
          otherSides: reported
            .filter((s) => s.connectionId !== connectionId)
            .map((s) => {
              const other = byId.get(s.connectionId);
              return {
                connectionId: s.connectionId,
                connectionName: other?.name ?? "",
                queryLanguage: languageOf(other?.type ?? ""),
                entityKey: s.entityKey,
                keyPropertyKey: s.keyPropertyKey,
              };
            })
            .sort((a, b) =>
              byKey(
                [a.connectionId, a.entityKey, a.keyPropertyKey],
                [b.connectionId, b.entityKey, b.keyPropertyKey],
              ),
            ),
        },
      ];
    })
    .sort((a, b) => byKey([a.name, a.parameter], [b.name, b.parameter]));

  const body = {
    connection: {
      id: here.id,
      name: here.name,
      queryLanguage: languageOf(here.type),
    },
    terms,
    concepts: outConcepts,
  };
  const version = createHash("sha256")
    .update(JSON.stringify(body))
    .digest("hex")
    .slice(0, 16);
  return { version, ...body };
}
