import type { SchemaTerm } from "@neoboard/connection";

/** What a creator said about one term, as stored. */
export interface StoredTerm {
  kind: string;
  key: string;
  parentKey: string;
  displayName: string;
  description: string;
  hidden: boolean;
}

/** A term as the Model page and the API show it. */
export interface OntologyTerm extends Omit<SchemaTerm, "kind"> {
  kind: string;
  displayName: string;
  description: string;
  hidden: boolean;
  /** Stored, but the connection no longer reports it. Worked out per read. */
  orphaned: boolean;
}

const idOf = (t: { kind: string; key: string; parentKey: string }) =>
  JSON.stringify([t.kind, t.key, t.parentKey]);

/**
 * The live structure (what the connection holds) with the stored meaning laid
 * over it, followed by the stored terms the structure no longer reports,
 * flagged as orphaned. Pure: a read never writes.
 */
export function mergeTerms(
  live: SchemaTerm[],
  stored: StoredTerm[],
): OntologyTerm[] {
  const byId = new Map(stored.map((s) => [idOf(s), s]));
  const liveIds = new Set(live.map(idOf));
  const merged = live.map((t) => {
    const s = byId.get(idOf(t));
    return {
      ...t,
      displayName: s?.displayName ?? "",
      description: s?.description ?? "",
      hidden: s?.hidden ?? false,
      orphaned: false,
    };
  });
  const orphans = stored
    .filter((s) => !liveIds.has(idOf(s)))
    .map((s) => ({
      kind: s.kind,
      key: s.key,
      parentKey: s.parentKey,
      displayName: s.displayName,
      description: s.description,
      hidden: s.hidden,
      orphaned: true,
    }));
  return [...merged, ...orphans];
}
