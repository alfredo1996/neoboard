"use client";

import dynamic from "next/dynamic";
import { Info } from "lucide-react";
import {
  Label,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@neoboard/components";
import type { ChartType } from "@/lib/chart-registry";

// CodeMirror accesses real DOM APIs — load it only client-side.
const QueryEditor = dynamic(
  () =>
    import("@neoboard/components").then((m) => ({ default: m.QueryEditor })),
  { ssr: false }
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
};

export interface QueryEditorPanelProps {
  chartType: string;
  query: string;
  onQueryChange: (q: string) => void;
  onRun: () => void;
  editorLanguage: "cypher" | "sql";
  connectionId: string;
}

export function QueryEditorPanel({
  chartType,
  query,
  onQueryChange,
  onRun,
  editorLanguage,
  connectionId,
}: QueryEditorPanelProps) {
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
            <TooltipContent side="top" className="max-w-sm text-xs whitespace-pre-line">
              {QUERY_HINTS[chartType as ChartType]}
            </TooltipContent>
          </Tooltip>
        )}
      </div>
      <QueryEditor
        value={query}
        onChange={onQueryChange}
        onRun={onRun}
        language={editorLanguage}
        readOnly={!connectionId}
        placeholder={
          !connectionId
            ? "Select a connection first to write a query"
            : editorLanguage === "sql"
            ? "SELECT * FROM users LIMIT 10"
            : "MATCH (n) RETURN n.name AS name, n.born AS value LIMIT 10"
        }
        className="min-h-[220px]"
      />
    </div>
  );
}
