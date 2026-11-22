export interface TermEdit {
  kind: string;
  key: string;
  parentKey?: string;
  displayName?: string;
  description?: string;
  hidden?: boolean;
  remove?: boolean;
}

type Fields = Partial<Pick<TermEdit, "displayName" | "description" | "hidden">>;
type TermKey = { kind: string; key: string; parentKey: string };

export interface TermWritePlan {
  /** Stored meanings to delete first. */
  removals: TermKey[];
  /** Terms sent the same fields share one upsert, so each changes only those. */
  groups: Array<{
    fields: Array<keyof Fields>;
    rows: Array<TermKey & Fields>;
  }>;
}

/**
 * One final entry per term, folding the body in order (#2534): a removal wipes
 * what came before and an edit after it revives the term, so the later entry
 * always wins, as when each was applied one by one. Pure.
 */
export function planTermWrites(terms: TermEdit[]): TermWritePlan {
  const folded = new Map<
    string,
    { term: TermKey; removed: boolean; edited: boolean; fields: Fields }
  >();
  for (const t of terms) {
    const term = { kind: t.kind, key: t.key, parentKey: t.parentKey ?? "" };
    const id = JSON.stringify([term.kind, term.key, term.parentKey]);
    const state = folded.get(id) ?? {
      term,
      removed: false,
      edited: false,
      fields: {},
    };
    folded.set(id, state);
    if (t.remove) {
      state.removed = true;
      state.edited = false;
      state.fields = {};
      continue;
    }
    state.edited = true;
    for (const f of ["displayName", "description", "hidden"] as const) {
      if (t[f] !== undefined) Object.assign(state.fields, { [f]: t[f] });
    }
  }
  const removals: TermKey[] = [];
  const groups = new Map<string, TermWritePlan["groups"][number]>();
  for (const { term, removed, edited, fields } of folded.values()) {
    if (removed) removals.push(term);
    if (!edited) continue; // removed and not revived: nothing left to write
    const names = Object.keys(fields).sort() as Array<keyof Fields>;
    const shape = names.join(",");
    const group = groups.get(shape) ?? { fields: names, rows: [] };
    group.rows.push({ ...term, ...fields });
    groups.set(shape, group);
  }
  return { removals, groups: [...groups.values()] };
}
