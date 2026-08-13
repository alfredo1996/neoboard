"use client";

import dynamic from "next/dynamic";
import { useWidgetEditorStore } from "@/stores/widget-editor-store";
import {
  AlertCircle,
  Info,
  RefreshCw,
  Clock,
  Maximize2,
  Minimize2,
} from "lucide-react";
import {
  Alert,
  AlertDescription,
  Label,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
  Button,
  Popover,
  PopoverTrigger,
  PopoverContent,
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "@neoboard/components";
import { FileCode } from "lucide-react";
import type { ChartType } from "@/lib/plugin/chart-helpers";
import { useConnectionSchema } from "@/hooks/use-schema";
import { useSchemaStore } from "@/stores/schema-store";

// CodeMirror accesses real DOM APIs — load it only client-side.
const QueryEditor = dynamic(
  () =>
    import("@neoboard/components").then((m) => ({ default: m.QueryEditor })),
  { ssr: false },
);

function formatTimeAgo(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const sec = Math.floor(ms / 1000);
  if (sec < 60) return "just now";
  const min = Math.floor(sec / 60);
  if (min < 60) return min + "m ago";
  const hr = Math.floor(min / 60);
  if (hr < 24) return hr + "h ago";
  const days = Math.floor(hr / 24);
  return days + "d ago";
}

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
  /** #1374 — when true the editor is expanded and the preview pane is unmounted. */
  maximized?: boolean;
  /** When omitted, the expand/collapse toggle is not rendered. */
  onToggleMaximized?: () => void;
}

export function QueryEditorPanel({
  onRun,
  editorLanguage,
  running,
  maximized = false,
  onToggleMaximized,
}: QueryEditorPanelProps) {
  const chartType = useWidgetEditorStore((s) => s.chartType);
  const query = useWidgetEditorStore((s) => s.query);
  const onQueryChange = useWidgetEditorStore((s) => s.setQuery);
  const connectionId = useWidgetEditorStore((s) => s.connectionId);
  const queryHistory = useWidgetEditorStore((s) => s.queryHistory);
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
            {/* #1283: an <svg> is not focusable, so this tooltip's focus
                handlers could never fire and the query hint was pointer-only.
                A real button carries the same tooltip and reaches keyboards. */}
            <TooltipTrigger asChild>
              <button
                type="button"
                aria-label="Query hint"
                className="rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
              >
                <Info className="h-3.5 w-3.5 text-muted-foreground cursor-help shrink-0" />
              </button>
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
            {queryHistory.length > 0 && (
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-5 gap-1 px-1.5 text-xs text-muted-foreground"
                    aria-label="Query history"
                  >
                    <Clock className="h-3 w-3" />
                    History
                  </Button>
                </PopoverTrigger>
                <PopoverContent
                  align="start"
                  className="w-80 max-h-64 overflow-y-auto p-0"
                >
                  <div className="px-3 py-2 border-b">
                    <p className="text-xs font-medium text-muted-foreground">
                      Previous queries
                    </p>
                  </div>
                  {queryHistory.map((entry, i) => (
                    <button
                      key={entry.savedAt + i}
                      type="button"
                      className="w-full text-left px-3 py-2 hover:bg-accent text-xs border-b last:border-b-0 transition-colors"
                      onClick={() => onQueryChange(entry.query)}
                    >
                      <code className="block truncate text-[11px]">
                        {entry.query.split("\n")[0]}
                      </code>
                      <span className="text-muted-foreground text-[10px]">
                        {formatTimeAgo(entry.savedAt)}
                      </span>
                    </button>
                  ))}
                </PopoverContent>
              </Popover>
            )}
          </>
        )}
        {/* #1374 — lives in the *editor* header, not the preview header: the
            preview header disappears when maximized, which would leave no way
            back (and #1372 adds its own toggle there). */}
        {onToggleMaximized && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="ml-auto h-5 w-5"
                onClick={onToggleMaximized}
                aria-pressed={maximized}
                aria-label={maximized ? "Collapse editor" : "Expand editor"}
              >
                {maximized ? (
                  <Minimize2 className="h-3 w-3" />
                ) : (
                  <Maximize2 className="h-3 w-3" />
                )}
              </Button>
            </TooltipTrigger>
            <TooltipContent side="top" className="text-xs">
              {maximized
                ? "Restore the preview alongside the editor"
                : "Hide the preview and give the editor the full modal width"}
            </TooltipContent>
          </Tooltip>
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
        // Collapsed, the editor has NO definite height: `.cm-editor { height:
        // 100% }` resolves against an indefinite flex parent, so it computes to
        // `auto` and the column grows with the document (measured 220px empty →
        // 2391px at 120 lines). What scrolls then is the whole settings column,
        // toolbar and chart selectors and all. Maximized we give it a definite
        // height so it scrolls itself with the Run toolbar pinned. 70vh is the
        // practical ceiling — the modal body is capped at calc(90vh - 180px),
        // so anything larger just spills back into the column (#1374).
        className={maximized ? "h-[70vh] min-h-[220px]" : "min-h-[220px]"}
      />
    </div>
  );
}
