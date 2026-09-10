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
    children: (props?.[name] ?? []).map((p) => ({
      name: p.name,
      type: p.type,
    })),
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
 * Quote an identifier only when the language would otherwise misparse it:
 * backticks for Cypher, double quotes for SQL (where an unquoted name folds
 * to lower case, so anything with capitals must be quoted to round-trip).
 */
export function quoteIdentifier(name: string, language: string): string {
  const cypher = language === "cypher" || language === "neo4j";
  const plain = cypher ? /^[A-Za-z_]\w*$/ : /^[a-z_][a-z0-9_]*$/;
  if (plain.test(name)) return name;
  const q = cypher ? "`" : '"';
  return q + name.replaceAll(q, q + q) + q;
}
