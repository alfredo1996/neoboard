"use client";

import dynamic from "next/dynamic";
import { useWidgetEditorStore } from "@/stores/widget-editor-store";
import { AlertCircle, Info, RefreshCw } from "lucide-react";
import {
  Alert,
  AlertDescription,
  Label,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
  Button,
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "@neoboard/components";
import { FileCode } from "lucide-react";
import type { ChartType } from "@/lib/chart-helpers";
import { useConnectionSchema } from "@/hooks/use-schema";
import { useSchemaStore } from "@/stores/schema-store";

// CodeMirror accesses real DOM APIs — load it only client-side.
const QueryEditor = dynamic(
  () =>
    import("@neoboard/components").then((m) => ({ default: m.QueryEditor })),
  { ssr: false },
);

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

/** Built-in query starter templates by connection language. */
const QUERY_TEMPLATES: Record<string, { label: string; query: string }[]> = {
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

function getTemplates(lang: string) {
  const key =
    lang === "neo4j" ? "cypher" : lang === "postgresql" ? "sql" : lang;
  return QUERY_TEMPLATES[key] ?? QUERY_TEMPLATES.sql ?? [];
}

export interface QueryEditorPanelProps {
  /** When omitted, the Ctrl/Cmd+Enter run shortcut is disabled (e.g. form widgets). */
  onRun?: () => void;
  /** Connector type or language name — mapped to editor extension by the language resolver registry. */
  editorLanguage: string;
  /** When true, shows a running/loading indicator on the query editor. */
  running?: boolean;
}

export function QueryEditorPanel({
  onRun,
  editorLanguage,
  running,
}: QueryEditorPanelProps) {
  const chartType = useWidgetEditorStore((s) => s.chartType);
  const query = useWidgetEditorStore((s) => s.query);
  const onQueryChange = useWidgetEditorStore((s) => s.setQuery);
  const connectionId = useWidgetEditorStore((s) => s.connectionId);
  // Prefetch schema for autocompletion. The hook caches for 10 min
  // and also writes to the Zustand store for synchronous reads.
  const { isFetching, refreshSchema } = useConnectionSchema(connectionId);
  const schema = useSchemaStore((s) => s.getSchema(connectionId));

  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-1.5">
        <Label htmlFor="editor-query">
          Query <span className="text-destructive">*</span>
        </Label>
        {chartType && QUERY_HINTS[chartType as ChartType] && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Info className="h-3.5 w-3.5 text-muted-foreground cursor-help shrink-0" />
            </TooltipTrigger>
            <TooltipContent
              side="top"
              className="max-w-sm text-xs whitespace-pre-line"
            >
              {QUERY_HINTS[chartType as ChartType]}
            </TooltipContent>
          </Tooltip>
        )}
        {connectionId && (
          <>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-5 w-5"
                  onClick={() => refreshSchema()}
                  disabled={isFetching}
                  aria-label="Refresh schema"
                >
                  <RefreshCw
                    className={`h-3 w-3 ${isFetching ? "animate-spin" : ""}`}
                  />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="top" className="text-xs">
                Refresh schema for autocompletion
              </TooltipContent>
            </Tooltip>
            {!query && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-5 gap-1 px-1.5 text-xs text-muted-foreground"
                  >
                    <FileCode className="h-3 w-3" />
                    Templates
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start">
                  {getTemplates(editorLanguage).map((t) => (
                    <DropdownMenuItem
                      key={t.label}
                      onSelect={() => onQueryChange(t.query)}
                    >
                      {t.label}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </>
        )}
      </div>
      {!connectionId && query.trim() && (
        <Alert
          className="border-amber-500/50 text-amber-700 dark:text-amber-400 [&>svg]:text-amber-600 dark:[&>svg]:text-amber-400"
          data-testid="no-connector-warning"
        >
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            Select a connection to enable syntax highlighting and query
            execution.
          </AlertDescription>
        </Alert>
      )}
      <QueryEditor
        value={query}
        onChange={onQueryChange}
        onRun={onRun}
        running={running}
        language={editorLanguage}
        schema={schema}
        placeholder={
          editorLanguage === "sql"
            ? "SELECT * FROM users LIMIT 10"
            : "MATCH (n) RETURN n.name AS name, n.born AS value LIMIT 10"
        }
        className="min-h-[220px]"
      />
    </div>
  );
}
