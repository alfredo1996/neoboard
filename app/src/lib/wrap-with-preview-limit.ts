/**
 * Wraps a query with a row limit for preview-only execution.
 * PostgreSQL uses a subquery wrapper; Cypher appends LIMIT.
 * This MUST NOT be applied to production dashboard queries.
 */
export function wrapWithPreviewLimit(
  query: string,
  connectorType: "neo4j" | "postgresql",
  limit = 25
): string {
  const trimmed = query.trim().replace(/;$/, "");
  if (!trimmed) return trimmed;
  if (connectorType === "postgresql") {
    return `SELECT * FROM (${trimmed}) AS __preview LIMIT ${limit}`;
  }
  // Cypher — skip if the query already ends with a LIMIT clause to avoid
  // "Multiple LIMIT clauses are not allowed" syntax errors in Neo4j.
  if (/\bLIMIT\s+\d+\s*$/i.test(trimmed)) {
    return trimmed;
  }
  return `${trimmed} LIMIT ${limit}`;
}
