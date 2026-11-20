/**
 * What a creator said about a connection's terms (#2415), as the query editor
 * uses it: hidden terms are left out of autocomplete, and a described term
 * shows its display name and description beside its completion.
 *
 * The editor receives the meaning as data from the app; nothing here knows a
 * connector. Terms are matched to the schema by key, the way the Model page
 * stores them: `entity:<key>` and `relationship:<key>` name a property's parent.
 */
import type { Completion } from "@codemirror/autocomplete";
import type { DatabaseSchema } from "./schema-transforms";

/** One term with its saved meaning. */
export interface TermMeaning {
  kind: string;
  key: string;
  parentKey: string;
  displayName: string;
  description: string;
  hidden: boolean;
}

const said = (t: TermMeaning) => !t.hidden && (t.displayName || t.description);

/** The schema without the terms a creator hid. */
export function hideTerms(
  schema: DatabaseSchema,
  terms: readonly TermMeaning[],
): DatabaseSchema {
  const hidden = terms.filter((t) => t.hidden);
  const named = (kind: string) =>
    new Set(hidden.filter((t) => t.kind === kind).map((t) => t.key));
  const entities = named("entity");
  const relationships = named("relationship");
  const props = new Set(
    hidden
      .filter((t) => t.kind === "property")
      .map((t) => JSON.stringify([t.parentKey, t.key])),
  );
  const keep = (parent: string, list: { name: string }[]) =>
    list.filter((p) => !props.has(JSON.stringify([parent, p.name])));
  const byParent = <P extends { name: string }>(
    map: Record<string, P[]> | undefined,
    gone: Set<string>,
    kind: string,
  ) =>
    map &&
    Object.fromEntries(
      Object.entries(map)
        .filter(([key]) => !gone.has(key))
        .map(([key, list]) => [key, keep(`${kind}:${key}`, list)]),
    );

  return {
    ...schema,
    ...(schema.labels && {
      labels: schema.labels.filter((l) => !entities.has(l)),
    }),
    ...(schema.relationshipTypes && {
      relationshipTypes: schema.relationshipTypes.filter(
        (r) => !relationships.has(r),
      ),
    }),
    ...(schema.nodeProperties && {
      nodeProperties: byParent(schema.nodeProperties, entities, "entity"),
    }),
    ...(schema.relProperties && {
      relProperties: byParent(
        schema.relProperties,
        relationships,
        "relationship",
      ),
    }),
    ...(schema.tables && {
      tables: schema.tables
        .filter((t) => !entities.has(t.name))
        .map((t) => ({ ...t, columns: keep(`entity:${t.name}`, t.columns) })),
    }),
  } as DatabaseSchema;
}

/** The first described, visible term that a completion's label names. */
export function meaningOf(
  label: string,
  terms: readonly TermMeaning[],
): TermMeaning | undefined {
  return terms.find((t) => t.key === label && said(t));
}

/**
 * An `autocompletion({ addToOptions })` entry: the display name and
 * description of the term a completion names. `getTerms` is read on each
 * render, so new meaning shows without rebuilding the editor.
 */
export function termOption(
  getTerms: () => readonly TermMeaning[] | undefined,
): {
  render: (completion: Completion, ...rest: unknown[]) => Node | null;
  position: number;
} {
  return {
    position: 70,
    render: (completion) => {
      const m = meaningOf(completion.label, getTerms() ?? []);
      if (!m) return null;
      const el = document.createElement("span");
      el.className = "cm-completionDetail";
      el.textContent = [m.displayName, m.description]
        .filter(Boolean)
        .join(" — ");
      return el;
    },
  };
}
