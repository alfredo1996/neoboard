export interface QuerySnippet {
  label: string;
  query: string;
  language: "cypher" | "sql";
}

export const BUILT_IN_SNIPPETS: QuerySnippet[] = [
  // Cypher
  {
    label: "Match all nodes",
    query: "MATCH (n)\nRETURN n\nLIMIT 25",
    language: "cypher",
  },
  {
    label: "Match with relationship",
    query: "MATCH (n)-[r]->(m)\nRETURN n, r, m\nLIMIT 25",
    language: "cypher",
  },
  {
    label: "Match by property",
    query: "MATCH (n:Label)\nWHERE n.property = $param\nRETURN n",
    language: "cypher",
  },
  {
    label: "Count by label",
    query:
      "MATCH (n:Label)\nRETURN labels(n)[0] AS label, COUNT(n) AS count\nORDER BY count DESC",
    language: "cypher",
  },
  // SQL
  {
    label: "Select all",
    query: "SELECT *\nFROM table_name\nLIMIT 25",
    language: "sql",
  },
  {
    label: "Group and count",
    query:
      "SELECT column_name, COUNT(*) AS count\nFROM table_name\nGROUP BY column_name\nORDER BY count DESC",
    language: "sql",
  },
  {
    label: "Filter by parameter",
    query:
      "SELECT *\nFROM table_name\nWHERE column_name = $1\nORDER BY created_at DESC",
    language: "sql",
  },
  {
    label: "Aggregate with date filter",
    query:
      "SELECT\n  date_trunc('day', created_at) AS day,\n  SUM(amount) AS total\nFROM table_name\nWHERE created_at >= $1\nGROUP BY day\nORDER BY day",
    language: "sql",
  },
];
