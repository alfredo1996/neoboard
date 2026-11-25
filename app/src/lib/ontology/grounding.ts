import { createHash } from "node:crypto";
import { and, eq, inArray } from "drizzle-orm";
import { getConnector, type TermJoin } from "@neoboard/connection";
import { db } from "@/lib/db";
import {
  ontologyConcepts,
  ontologyConceptSides,
  ontologyTerms,
  type UserRole,
} from "@/lib/db/schema";
import { liveTermsById, usableConnections } from "@/lib/ontology/concepts";
import { mergeTerms, type OntologyTerm } from "@/lib/ontology/merge";
import { entityParentKey } from "@/lib/ontology/term-keys";

/**
 * Thrown when the grounded connection's own structure cannot be read (#2574):
 * a model built on nothing would carry a valid version, so the read refuses
 * instead. `null` already means "not usable by the caller".
 */
export class GroundingStructureUnavailableError extends Error {
  constructor(readonly connectionId: string) {
    super("The connection's structure cannot be read");
  }
}

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
    primaryKey?: boolean;
    joins?: TermJoin[];
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
 * What a prompt may show of one connection: live, not hidden, and not under a
 * hidden entity or relationship (a hidden head takes its properties with it,
 * as `filterGroups` does).
 */
function visibleOf(terms: OntologyTerm[]) {
  const hiddenHeads = new Set(
    terms.filter((t) => t.hidden).map((t) => `${t.kind}:${t.key}`),
  );
  return terms.filter(
    (t) =>
      !t.orphaned &&
      !t.hidden &&
      !(t.kind === "property" && hiddenHeads.has(t.parentKey)),
  );
}

/** Whether a side's entity and key property are both there to be shown. */
function isShown(
  visible: OntologyTerm[],
  s: { entityKey: string; keyPropertyKey: string },
) {
  const parent = entityParentKey(s.entityKey);
  return (
    visible.some((t) => t.kind === "entity" && t.key === s.entityKey) &&
    visible.some(
      (t) =>
        t.kind === "property" &&
        t.key === s.keyPropertyKey &&
        t.parentKey === parent,
    )
  );
}

/** Joins, less any that point at a hidden or unknown entity, in a fixed order. */
function joinsOf(t: OntologyTerm, entities: Set<string>) {
  const joins = (t.joins ?? [])
    .filter((j) => entities.has(j.from) && entities.has(j.to))
    .sort((a, b) =>
      byKey(
        [a.from, a.to, ...(a.fromColumns ?? [])],
        [b.from, b.to, ...(b.fromColumns ?? [])],
      ),
    );
  return joins.length > 0 ? joins : undefined;
}

/**
 * A connection's model ready to go into a prompt (#2574): its live, visible
 * terms and the concepts with a live, visible side on it, each with its other
 * sides on connections the caller can use. `null` when the caller cannot use
 * the connection (another tenant's, or not shared with them). Throws
 * `GroundingStructureUnavailableError` when this connection's structure cannot
 * be read. Only verified sides are shown: an other side whose connection
 * cannot be read, or whose entity or key is gone or hidden, is dropped. Only
 * the connections that share a concept with this one are read. Independent of
 * read order: the same model gives the same bytes and the same version.
 */
export async function getGroundingModel(
  session: Session,
  connectionId: string,
): Promise<GroundingModel | null> {
  const { tenantId } = session;
  const usable = await usableConnections(session);
  const here = usable.find((c) => c.id === connectionId);
  if (!here) return null;

  const readStored = (ids: string[]) =>
    db
      .select()
      .from(ontologyTerms)
      .where(
        and(
          eq(ontologyTerms.tenantId, tenantId),
          inArray(ontologyTerms.connectionId, ids),
        ),
      );
  const [hereStored, hereLive, concepts, sides] = await Promise.all([
    readStored([connectionId]),
    liveTermsById([here]),
    db
      .select()
      .from(ontologyConcepts)
      .where(eq(ontologyConcepts.tenantId, tenantId)),
    db
      .select()
      .from(ontologyConceptSides)
      .where(eq(ontologyConceptSides.tenantId, tenantId)),
  ]);
  const liveHere = hereLive.get(connectionId);
  if (!liveHere) throw new GroundingStructureUnavailableError(connectionId);

  const merged = mergeTerms(
    liveHere,
    hereStored.filter((t) => t.connectionId === connectionId),
  );
  const shown = visibleOf(merged);

  const usableIds = new Set(usable.map((c) => c.id));
  const visibleSides = sides.filter((s) => usableIds.has(s.connectionId));
  const keep = concepts.flatMap((c) => {
    const all = visibleSides.filter((s) => s.conceptId === c.id);
    const mine = all.filter(
      (s) => s.connectionId === connectionId && isShown(shown, s),
    );
    return mine.length === 0
      ? []
      : [
          {
            c,
            mine,
            others: all.filter((s) => s.connectionId !== connectionId),
          },
        ];
  });

  // Only the connections sharing a kept concept are read.
  const otherIds = [
    ...new Set(keep.flatMap((k) => k.others.map((s) => s.connectionId))),
  ];
  const byId = new Map(usable.map((c) => [c.id, c]));
  const [otherLive, otherStored] = otherIds.length
    ? await Promise.all([
        liveTermsById(otherIds.map((id) => byId.get(id)!)),
        readStored(otherIds),
      ])
    : [new Map<string, undefined>(), []];
  const otherShown = new Map(
    otherIds.flatMap((id) => {
      const l = otherLive.get(id);
      return l
        ? [
            [
              id,
              visibleOf(
                mergeTerms(
                  l,
                  otherStored.filter((t) => t.connectionId === id),
                ),
              ),
            ] as const,
          ]
        : [];
    }),
  );

  const entities = new Set(
    shown.filter((t) => t.kind === "entity").map((t) => t.key),
  );
  const terms = shown
    .map((t) => ({
      kind: t.kind,
      key: t.key,
      parentKey: t.parentKey,
      type: t.type,
      primaryKey: t.primaryKey,
      joins: joinsOf(t, entities),
      displayName: t.displayName,
      description: t.description,
    }))
    .sort((a, b) =>
      byKey([a.kind, a.key, a.parentKey], [b.kind, b.key, b.parentKey]),
    );

  const outConcepts = keep
    .map(({ c, mine, others }) => ({
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
      otherSides: others
        .filter((s) => {
          const v = otherShown.get(s.connectionId);
          return v !== undefined && isShown(v, s);
        })
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
    }))
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
