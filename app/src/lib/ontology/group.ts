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
 * first. Built once per read, in one pass; `filterGroups` then narrows it for a
 * search or the hidden switch without touching every property again (#2533).
 * A property whose parent is no longer listed (an orphan) stands as a group of
 * its own.
 */
export function buildGroups(terms: OntologyTerm[]): TermGroup[] {
  const children = new Map<string, OntologyTerm[]>();
  const heads = new Set<string>();
  for (const t of terms) {
    if (t.kind === "property") {
      const list = children.get(t.parentKey);
      if (list) list.push(t);
      else children.set(t.parentKey, [t]);
    } else {
      heads.add(`${t.kind}:${t.key}`);
    }
  }
  const groups: TermGroup[] = [];
  for (const t of terms) {
    if (t.kind !== "property") {
      groups.push({
        head: t,
        properties: children.get(`${t.kind}:${t.key}`) ?? [],
      });
    } else if (!heads.has(t.parentKey)) {
      groups.push({ head: t, properties: [] });
    }
  }
  const rank = (g: TermGroup) => {
    const i = KIND_ORDER.indexOf(g.head.kind);
    return i === -1 ? KIND_ORDER.length : i;
  };
  return groups.sort((a, b) => rank(a) - rank(b));
}

/**
 * The groups a search keeps: a group matches when any of its terms does, and
 * is shown whole. Hidden terms are left out unless `showHidden`; a hidden head
 * takes its properties with it.
 */
export function filterGroups(
  groups: TermGroup[],
  search: string,
  showHidden: boolean,
): TermGroup[] {
  const q = search.trim().toLowerCase();
  const out: TermGroup[] = [];
  for (const g of groups) {
    if (!showHidden && g.head.hidden) continue;
    const properties = showHidden
      ? g.properties
      : g.properties.filter((p) => !p.hidden);
    if (!q || matches(g.head, q) || properties.some((p) => matches(p, q))) {
      out.push({ head: g.head, properties });
    }
  }
  return out;
}
