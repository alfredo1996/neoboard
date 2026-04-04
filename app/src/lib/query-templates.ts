/**
 * Query starter templates and helper logic used by the widget editor.
 *
 * Extracted from query-editor-panel.tsx for independent testability.
 */

import type { ChartType } from "@/lib/chart-registry";

/** Per-chart-type hints shown next to the Query label to guide column conventions. */
export const QUERY_HINTS: Partial<Record<ChartType, string>> = {
  bar:
    "Return 2+ columns: first = category label (string), rest = numeric series.\n" +
    "Example: RETURN genre, count(*) AS films",
  line:
    "Return 2+ columns: first = x-axis label, rest = numeric series.\n" +
    "Example: RETURN month, revenue, expenses",
  pie:
    "Return 2 columns: first = slice label (string), second = numeric value.\n" +
    "Example: RETURN category, count(*) AS total",
  "single-value":
    "Return a single row with 1 numeric column.\n" +
    "For trend mode, return 2 rows (current then previous period).\n" +
    "Example: RETURN count(n) AS total",
  graph:
    "Return nodes, relationships, or paths — not tabular data.\n" +
    "Example: MATCH (a)-[r]->(b) RETURN a, r, b",
  map:
    "Return 3 columns in order: latitude (number), longitude (number), label (string).\n" +
    "Example: RETURN lat, lng, name",
  table:
    "Return any columns — all are displayed as-is.\n" +
    "Example: SELECT * FROM orders LIMIT 100",
  json:
    "Return any data — rendered as a collapsible JSON tree.\n" +
    "Example: RETURN properties(n) AS data",
  form:
    "Write a mutation query with $param_xxx placeholders for each form field.\n" +
    "Example: CREATE (n:Person {name: $param_name, email: $param_email})",
};

export interface QueryTemplate {
  label: string;
  query: string;
}

/** Built-in query starter templates by connection language. */
export const QUERY_TEMPLATES: Record<string, QueryTemplate[]> = {
  cypher: [
    {
      label: "Top N by count",
      query:
        "MATCH (n)\nRETURN labels(n)[0] AS label, count(*) AS count\nORDER BY count DESC\nLIMIT 10",
    },
    {
      label: "Time series",
      query:
        "MATCH (e)\nRETURN e.date AS date, count(*) AS value\nORDER BY date",
    },
    { label: "Full scan", query: "MATCH (n)\nRETURN n\nLIMIT 25" },
    {
      label: "Relationships",
      query: "MATCH (a)-[r]->(b)\nRETURN a, r, b\nLIMIT 25",
    },
  ],
  sql: [
    {
      label: "Top N by count",
      query:
        "SELECT column_name, COUNT(*) AS count\nFROM table_name\nGROUP BY column_name\nORDER BY count DESC\nLIMIT 10",
    },
    {
      label: "Time series",
      query:
        "SELECT date_column AS date, COUNT(*) AS value\nFROM table_name\nGROUP BY date_column\nORDER BY date",
    },
    { label: "Full scan", query: "SELECT *\nFROM table_name\nLIMIT 25" },
  ],
};

/**
 * Resolves query templates for a given editor language.
 *
 * Maps connector types to their template set:
 * - "neo4j" → cypher templates
 * - "postgresql" → sql templates
 * - unknown → falls back to sql templates
 */
export function getTemplates(lang: string): QueryTemplate[] {
  const key =
    lang === "neo4j" ? "cypher" : lang === "postgresql" ? "sql" : lang;
  return QUERY_TEMPLATES[key] ?? QUERY_TEMPLATES.sql ?? [];
}

/**
 * Returns the auto-preview debounce delay in milliseconds based on the editor mode.
 *
 * - "add" mode uses a short debounce (300ms) to avoid firing while the user types.
 * - Other modes (edit, lab-edit) use zero delay for immediate preview.
 */
export function getAutoPreviewDelay(
  mode: "add" | "edit" | "lab-edit" | "lab-create",
): number {
  return mode === "add" ? 300 : 0;
}

/** Debounce delay for auto-preview when the query text changes. */
export const QUERY_CHANGE_PREVIEW_DELAY = 800;

/**
 * Computes an effective widget ID with an optional suffix.
 *
 * When two CardContainers render the same widget (e.g. normal view + fullscreen),
 * a suffix prevents store key conflicts.
 *
 * @param widgetId - The original widget ID.
 * @param suffix - Optional suffix (e.g. "fullscreen").
 * @returns widgetId or "widgetId--suffix" if suffix is truthy.
 */
export function computeEffectiveWidgetId(
  widgetId: string,
  suffix?: string,
): string {
  return suffix ? `${widgetId}--${suffix}` : widgetId;
}
