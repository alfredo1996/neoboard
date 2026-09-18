/**
 * Pure helpers for the schema browser (#1693): a `DatabaseSchema` becomes a
 * list of sections → nodes → leaves that the SchemaBrowser renders, plus the
 * substring filter behind its search box and the quoting a clicked identifier
 * needs before it can be dropped into a query.
 */
import type { DatabaseSchema } from "./schema-transforms";

export interface SchemaTreeLeaf {
  name: string;
  type: string;
}

export interface SchemaTreeNode {
  name: string;
  children: SchemaTreeLeaf[];
}

export interface SchemaTreeSection {
  title: string;
  nodes: SchemaTreeNode[];
}

function nodesFrom(
  names: string[] | undefined,
  props: Record<string, { name: string; type: string }[]> | undefined,
): SchemaTreeNode[] {
  return (names ?? []).filter(Boolean).map((name) => ({
    name,
    // A property-less label arrives with one null-named "property" from
    // older schema payloads; the completion transform drops it too (#1714).
    children: (props?.[name] ?? [])
      .filter((p) => p.name)
      .map((p) => ({ name: p.name, type: p.type })),
  }));
}

export function toSchemaTree(schema: DatabaseSchema): SchemaTreeSection[] {
  const sections: SchemaTreeSection[] = [
    { title: "Labels", nodes: nodesFrom(schema.labels, schema.nodeProperties) },
    {
      title: "Relationship types",
      nodes: nodesFrom(schema.relationshipTypes, schema.relProperties),
    },
    {
      title: "Tables",
      nodes: (schema.tables ?? []).map((t) => ({
        name: t.name,
        children: t.columns.map((c) => ({ name: c.name, type: c.type })),
      })),
    },
  ];
  return sections.filter((s) => s.nodes.length > 0);
}

/**
 * Case-insensitive substring filter. A node whose own name matches keeps every
 * child; otherwise it survives only with the children that match.
 */
export function filterSchemaTree(
  tree: SchemaTreeSection[],
  query: string,
): SchemaTreeSection[] {
  const q = query.trim().toLowerCase();
  if (!q) return tree;
  return tree
    .map((section) => ({
      title: section.title,
      nodes: section.nodes.flatMap((node) => {
        if (node.name.toLowerCase().includes(q)) return [node];
        const children = node.children.filter((c) =>
          c.name.toLowerCase().includes(q),
        );
        return children.length ? [{ name: node.name, children }] : [];
      }),
    }))
    .filter((s) => s.nodes.length > 0);
}

/**
 * PostgreSQL's reserved keywords (Appendix C, "reserved" and "reserved, can
 * be function or type"): bare, they misparse as a column or table name —
 * `SELECT end FROM t` is a syntax error and `FROM user` is the current role.
 * Cypher needs no such list: labels after `:` and keys after `.` take keywords.
 */
const SQL_RESERVED = new Set(
  `all analyse analyze and any array as asc asymmetric authorization binary
   both case cast check collate collation column concurrently constraint
   create cross current_catalog current_date current_role current_schema
   current_time current_timestamp current_user default deferrable desc
   distinct do else end except false fetch for foreign freeze from full grant
   group having ilike in initially inner intersect into is isnull join lateral
   leading left like limit localtime localtimestamp natural not notnull null
   offset on only or order outer overlaps placing primary references returning
   right select session_user similar some symmetric system_user table
   tablesample then to trailing true union unique user using variadic verbose
   when where window with`.split(/\s+/),
);

/**
 * Quote an identifier only when the language would otherwise misparse it:
 * backticks for Cypher, double quotes for SQL (where an unquoted name folds
 * to lower case, so anything with capitals must be quoted to round-trip, and
 * a reserved word must be quoted to be a name at all).
 */
export function quoteIdentifier(name: string, language: string): string {
  const cypher = language === "cypher" || language === "neo4j";
  const plain = cypher ? /^[A-Za-z_]\w*$/ : /^[a-z_][a-z0-9_]*$/;
  if (plain.test(name) && (cypher || !SQL_RESERVED.has(name))) return name;
  const q = cypher ? "`" : '"';
  return q + name.replaceAll(q, q + q) + q;
}
