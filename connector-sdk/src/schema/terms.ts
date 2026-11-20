/**
 * The terms of a connection's data model (#2415): what the Model page lists.
 * Built here, in the connector library, so `app/` never reads a
 * `DatabaseSchema` for the ontology.
 */

import type { DatabaseSchema } from "./types";

export type TermKind = "entity" | "relationship" | "property";

/**
 * One pair of entities a relationship joins. A table join also names its
 * columns, the source's and the referenced table's, so a query can be written
 * from the term.
 */
export interface TermJoin {
  from: string;
  to: string;
  fromColumns?: string[];
  toColumns?: string[];
}

export interface SchemaTerm {
  kind: TermKind;
  /** Stable across a refresh: the name the connector reports. */
  key: string;
  /**
   * '' for an entity or a relationship. For a property, `<kind>:<key>` of the
   * term it belongs to, so an entity and a relationship that share a name
   * never share properties.
   */
  parentKey: string;
  /** A property's type, exactly as the connector reports it. */
  type?: string;
  /** A property that is (part of) its entity's primary key. */
  primaryKey?: boolean;
  /**
   * A relationship's endpoints: one pair per entity pair it joins, since one
   * graph relationship type can join several. A table foreign key has one.
   */
  joins?: TermJoin[];
}

const entity = (key: string): SchemaTerm => ({
  kind: "entity",
  key,
  parentKey: "",
});

/** The entries of `map` under `name`, own keys only: `toString` is a name. */
function own<T>(map: Record<string, T[]> | undefined, name: string): T[] {
  return map && Object.hasOwn(map, name) ? map[name] : [];
}

/** An identifier as it reads in a key; quoted when it holds a delimiter. */
const ident = (name: string): string =>
  /[,()\-> "\\]/.test(name) ? JSON.stringify(name) : name;

const idents = (names: string[]): string => names.map(ident).join(",");

/** The term list for today's two schema shapes (graph fields, `tables`). */
export function toTerms(schema: DatabaseSchema): SchemaTerm[] {
  const terms: SchemaTerm[] = [];

  for (const label of schema.labels ?? []) {
    terms.push(entity(label));
    for (const p of own(schema.nodeProperties, label)) {
      terms.push({
        kind: "property",
        key: p.name,
        parentKey: `entity:${label}`,
        type: p.type,
      });
    }
  }

  for (const table of schema.tables ?? []) {
    terms.push(entity(table.name));
    const pk = new Set(table.primaryKey ?? []);
    for (const c of table.columns) {
      terms.push({
        kind: "property",
        key: c.name,
        parentKey: `entity:${table.name}`,
        type: c.type,
        ...(pk.has(c.name) ? { primaryKey: true } : {}),
      });
    }
  }

  for (const type of schema.relationshipTypes ?? []) {
    const joins = (schema.relationshipPatterns ?? [])
      .filter((r) => r.type === type)
      .map(({ from, to }) => ({ from, to }));
    terms.push({
      kind: "relationship",
      key: type,
      parentKey: "",
      ...(joins.length > 0 ? { joins } : {}),
    });
    for (const p of own(schema.relProperties, type)) {
      terms.push({
        kind: "property",
        key: p.name,
        parentKey: `relationship:${type}`,
        type: p.type,
      });
    }
  }

  for (const table of schema.tables ?? []) {
    for (const fk of table.foreignKeys ?? []) {
      terms.push({
        kind: "relationship",
        // The key names its target, so two keys on the same columns differ.
        key: `${ident(table.name)}(${idents(fk.columns)})->${ident(fk.refTable)}(${idents(fk.refColumns)})`,
        parentKey: "",
        joins: [
          {
            from: table.name,
            to: fk.refTable,
            fromColumns: fk.columns,
            toColumns: fk.refColumns,
          },
        ],
      });
    }
  }

  return terms;
}
