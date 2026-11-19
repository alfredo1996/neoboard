import type { OntologyTerm } from "./merge";

export interface TermGroup {
  head: OntologyTerm;
  properties: OntologyTerm[];
}

const KIND_ORDER = ["entity", "relationship"];

const matches = (t: OntologyTerm, q: string) =>
  [t.key, t.displayName, t.description].some((s) =>
    s.toLowerCase().includes(q),
  );

/**
 * The terms as the Model page lists them: each entity or relationship with its
 * own properties (a property names its parent as `<kind>:<key>`), entities
 * first. A group matches a search when any of its terms does, and is shown
 * whole. Hidden terms are left out unless `showHidden`; a hidden head takes its
 * properties with it. A property whose parent is no longer listed (an orphan)
 * stands as a row of its own.
 */
export function groupTerms(
  terms: OntologyTerm[],
  search: string,
  showHidden: boolean,
): TermGroup[] {
  const q = search.trim().toLowerCase();
  const visible = terms.filter((t) => showHidden || !t.hidden);
  const headIds = new Set(
    visible
      .filter((t) => t.kind !== "property")
      .map((t) => `${t.kind}:${t.key}`),
  );
  const all = new Set(terms.map((t) => `${t.kind}:${t.key}`));
  const isChild = (t: OntologyTerm) =>
    t.kind === "property" && headIds.has(t.parentKey);
  const groups = visible
    .filter(
      (t) => !isChild(t) && !(t.kind === "property" && all.has(t.parentKey)),
    )
    .map((head) => ({
      head,
      properties: visible.filter(
        (p) => isChild(p) && p.parentKey === `${head.kind}:${head.key}`,
      ),
    }));
  const rank = (g: TermGroup) => {
    const i = KIND_ORDER.indexOf(g.head.kind);
    return i === -1 ? KIND_ORDER.length : i;
  };
  return groups
    .filter((g) => !q || [g.head, ...g.properties].some((t) => matches(t, q)))
    .sort((a, b) => rank(a) - rank(b));
}
