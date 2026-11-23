import type { Concept, ConceptSide } from "@/lib/ontology/concept-types";
import { entityParentKey } from "@/lib/ontology/term-keys";

/**
 * The sides of a concept on one connection that the connection still reports.
 * The editor reads concepts without structure, so "still reports" is decided
 * here from the connection's terms (#2552). No live terms (still loading,
 * failed, or a connector that describes none) says nothing, so every side is
 * offered, as the Model page's own check does.
 */
const liveSides = (
  c: Concept,
  connectionId: string,
  terms: readonly WiringTerm[],
): ConceptSide[] => {
  const live = terms.filter((t) => !t.orphaned);
  const has = (kind: string, key: string, parentKey: string) =>
    live.some(
      (t) => t.kind === kind && t.key === key && t.parentKey === parentKey,
    );
  return c.sides.filter(
    (s) =>
      s.connectionId === connectionId &&
      (live.length === 0 ||
        (has("entity", s.entityKey, "") &&
          has("property", s.keyPropertyKey, entityParentKey(s.entityKey)))),
  );
};

/** What wiring reads of a connection's term: the structure and the creator's words. */
export interface WiringTerm {
  kind: string;
  key: string;
  parentKey: string;
  displayName: string;
  hidden: boolean;
  orphaned?: boolean;
}

export interface FieldOffer {
  concept: Concept;
  /**
   * The entity whose key it is, set only when the key's name is also a
   * property of another entity on the connection: a bare `id` could be either.
   */
  entity?: string;
}

const lastSegment = (field: string) => field.slice(field.lastIndexOf(".") + 1);

const entityLabel = (terms: readonly WiringTerm[], entityKey: string) =>
  terms.find((t) => t.kind === "entity" && t.key === entityKey)?.displayName ||
  entityKey;

/**
 * The connections the concept maps a side on, less those whose every side the
 * server flagged `missing` (#2556). Only a live read flags one; without it
 * every connection is offered.
 */
export const conceptConnectionIds = (c: Concept): string[] => [
  ...new Set(c.sides.filter((s) => !s.missing).map((s) => s.connectionId)),
];

/**
 * The concepts for which `field` is the key on `connectionId`: any side of the
 * concept there, so a second side on the same connection counts (#2484). A
 * result column may carry its table (`p.email`), so the match is on the key
 * property's name after the last dot. When `terms` show that name on more than
 * one entity, the offer says which entity it would filter (#2485). Only plain
 * parameter names are saved from it (#2415 decision 10).
 */
export function conceptsForField(
  concepts: readonly Concept[],
  connectionId: string,
  field: string,
  terms: readonly WiringTerm[] = [],
): FieldOffer[] {
  if (!connectionId || !field) return [];
  const name = lastSegment(field);
  const owners = new Set(
    terms
      .filter((t) => t.kind === "property" && t.key === name && !t.orphaned)
      .map((t) => t.parentKey),
  );
  return concepts.flatMap((concept) => {
    const side = liveSides(concept, connectionId, terms).find(
      (s) => s.keyPropertyKey === name,
    );
    if (!side) return [];
    return [
      owners.size > 1
        ? { concept, entity: entityLabel(terms, side.entityKey) }
        : { concept },
    ];
  });
}

/**
 * Autocomplete entries for the concepts mapped on `connectionId`: the
 * parameter as a query consumes it (`$param_<name>`) and what it filters, in
 * the creator's words; a hidden entity or property is left out of the hint.
 */
export function parameterCompletions(
  concepts: readonly Concept[],
  connectionId: string,
  terms: readonly WiringTerm[] = [],
): { label: string; detail: string }[] {
  if (!connectionId) return [];
  const find = (kind: string, key: string, parentKey: string) =>
    terms.find(
      (t) => t.kind === kind && t.key === key && t.parentKey === parentKey,
    );
  return concepts.flatMap((c) => {
    const sides = liveSides(c, connectionId, terms);
    if (sides.length === 0) return [];
    const keys = sides.flatMap((s) => {
      const entity = find("entity", s.entityKey, "");
      const property = find(
        "property",
        s.keyPropertyKey,
        entityParentKey(s.entityKey),
      );
      if (entity?.hidden || property?.hidden) return [];
      return [
        `${entity?.displayName || s.entityKey}.${property?.displayName || s.keyPropertyKey}`,
      ];
    });
    return [
      {
        label: `$param_${c.parameter}`,
        detail:
          keys.length > 0 ? `${c.name}: filters by ${keys.join(", ")}` : c.name,
      },
    ];
  });
}
