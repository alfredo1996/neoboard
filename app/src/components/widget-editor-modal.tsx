"use client";

import React, { useState, useCallback, useEffect, useMemo, useRef } from "react";
import dynamic from "next/dynamic";
import { CardContainer } from "./card-container";
import { useQueryExecution } from "@/hooks/use-query-execution";
import type { DashboardWidget, ClickAction } from "@/lib/db/schema";
import type { ConnectionListItem } from "@/hooks/use-connections";
import {
  AlertCircle,
  AlertTriangle,
  BarChart3,
  LineChart as LineChartIcon,
  PieChart as PieChartIcon,
  Hash,
  GitGraph,
  Map,
  Table2,
  Braces,
  SlidersHorizontal,
  Calendar,
  Type,
  ListFilter,
  Info,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import {
  ChartOptionsPanel,
  ChartSettingsPanel,
  getDefaultChartSettings,
  Button,
  LoadingButton,
  Input,
  Label,
  Alert,
  AlertTitle,
  AlertDescription,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Checkbox,
  Combobox,
  Textarea,
  TextInputParameter,
  DatePickerParameter,
  DateRangeParameter,
  DateRelativePicker,
  ParamSelector,
  ParamMultiSelector,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@neoboard/components";
import {
  getCompatibleChartTypes,
  chartRegistry,
} from "@/lib/chart-registry";
import type { ChartType } from "@/lib/chart-registry";
import { useParameterValues } from "@/stores/parameter-store";
import { extractReferencedParams } from "@/hooks/use-widget-query";
import { wrapWithPreviewLimit } from "@/lib/wrap-with-preview-limit";
export { wrapWithPreviewLimit };

/** Icon + label map for chart type dropdown (keeps chart-registry free of UI concerns) */
const chartTypeMeta: Record<ChartType, { label: string; Icon: LucideIcon }> = {
  bar: { label: "Bar Chart", Icon: BarChart3 },
  line: { label: "Line Chart", Icon: LineChartIcon },
  pie: { label: "Pie Chart", Icon: PieChartIcon },
  "single-value": { label: "Single Value", Icon: Hash },
  graph: { label: "Graph", Icon: GitGraph },
  map: { label: "Map", Icon: Map },
  table: { label: "Data Table", Icon: Table2 },
  json: { label: "JSON Viewer", Icon: Braces },
  "parameter-select": { label: "Parameter Selector", Icon: SlidersHorizontal },
};

/** Per-chart-type hints shown next to the Query label to guide column conventions. */
const QUERY_HINTS: Partial<Record<ChartType, string>> = {
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

// ── Parameter type mapping helpers ──────────────────────────────────
type ParamUIType = "date" | "freetext" | "select";
type DateSubType = "single" | "range" | "relative";

function resolveInternalParamType(
  ui: ParamUIType,
  dateSub: DateSubType,
  multi: boolean
): string {
  if (ui === "date") {
    return dateSub === "range"
      ? "date-range"
      : dateSub === "relative"
        ? "date-relative"
        : "date";
  }
  if (ui === "freetext") return "text";
  return multi ? "multi-select" : "select";
}

function reverseParamTypeMapping(t: string): {
  uiType: ParamUIType;
  dateSub: DateSubType;
  multi: boolean;
} {
  switch (t) {
    case "date":
      return { uiType: "date", dateSub: "single", multi: false };
    case "date-range":
      return { uiType: "date", dateSub: "range", multi: false };
    case "date-relative":
      return { uiType: "date", dateSub: "relative", multi: false };
    case "text":
      return { uiType: "freetext", dateSub: "single", multi: false };
    case "multi-select":
      return { uiType: "select", dateSub: "single", multi: true };
    default:
      return { uiType: "select", dateSub: "single", multi: false };
  }
}

const paramTypeMeta: Record<ParamUIType, { label: string; Icon: LucideIcon }> = {
  date: { label: "Date Picker", Icon: Calendar },
  freetext: { label: "Freetext", Icon: Type },
  select: { label: "Select", Icon: ListFilter },
};

const paramTypes = Object.keys(paramTypeMeta) as ParamUIType[];

// CodeMirror accesses real DOM APIs — load it only client-side.
const QueryEditor = dynamic(
  () =>
    import("@neoboard/components").then((m) => ({ default: m.QueryEditor })),
  { ssr: false }
);

export interface WidgetEditorModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode: "add" | "edit";
  /** Existing widget to edit (required for edit mode) */
  widget?: DashboardWidget;
  /** Available connections */
  connections: ConnectionListItem[];
  /** Called with the final widget data on save */
  onSave: (widget: DashboardWidget) => void;
}

/**
 * Debounced seed query input — local draft state + 300ms debounce before
 * syncing to chartOptions to prevent excessive re-renders on every keystroke.
 */
function SeedQueryInput({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
}) {
  const [draft, setDraft] = useState(value);
  const onChangeRef = useRef(onChange);
  useEffect(() => { onChangeRef.current = onChange; }, [onChange]);

  // Sync external value changes (e.g. mode reset) into draft
  useEffect(() => {
    setDraft(value);
  }, [value]);

  // Debounce: sync draft → parent after 300ms idle
  useEffect(() => {
    const timer = setTimeout(() => {
      onChangeRef.current(draft);
    }, 300);
    return () => clearTimeout(timer);
  }, [draft]);

  return (
    <Textarea
      id="seed-query"
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      placeholder={placeholder}
      className="font-mono min-h-[80px]"
      rows={3}
    />
  );
}

export function WidgetEditorModal({
  open,
  onOpenChange,
  mode,
  widget,
  connections,
  onSave,
}: WidgetEditorModalProps) {
  const [chartType, setChartType] = useState(widget?.chartType ?? "bar");
  const [connectionId, setConnectionId] = useState(widget?.connectionId ?? "");
  const [query, setQuery] = useState(widget?.query ?? "");
  const [title, setTitle] = useState(
    (widget?.settings?.title as string) ?? ""
  );
  const [chartOptions, setChartOptions] = useState<Record<string, unknown>>(
    () => {
      if (widget?.settings?.chartOptions) {
        return widget.settings.chartOptions as Record<string, unknown>;
      }
      return getDefaultChartSettings(widget?.chartType ?? "bar");
    }
  );

  // Click action state
  const existingClickAction = widget?.settings?.clickAction as ClickAction | undefined;
  const [clickActionEnabled, setClickActionEnabled] = useState(!!existingClickAction);
  const [parameterName, setParameterName] = useState(
    existingClickAction?.parameterMapping.parameterName ?? ""
  );
  const [sourceField, setSourceField] = useState(
    existingClickAction?.parameterMapping.sourceField ?? ""
  );

  // Save status for visual feedback after CMD+Shift+Enter
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved">("idle");
  const savedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Cache settings
  const [enableCache, setEnableCache] = useState(
    widget?.settings?.enableCache !== false
  );
  const [cacheTtlMinutes, setCacheTtlMinutes] = useState(
    (widget?.settings?.cacheTtlMinutes as number | undefined) ?? 5
  );

  // Parameter widget editor state (only used when chartType === "parameter-select")
  const [paramUIType, setParamUIType] = useState<ParamUIType>("select");
  const [dateSub, setDateSub] = useState<DateSubType>("single");
  const [multiSelect, setMultiSelect] = useState(false);
  const [paramWidgetName, setParamWidgetName] = useState("");

  // Seed query preview options — populated when user clicks "Test Seed Query"
  const seedQueryExecution = useQueryExecution();
  const seedPreviewOptions = useMemo(() => {
    if (!seedQueryExecution.data?.data) return null;
    const rows = seedQueryExecution.data.data;
    if (!Array.isArray(rows) || rows.length === 0) return [];
    return rows.map((row) => {
      const r = row as Record<string, unknown>;
      const keys = Object.keys(r);
      return {
        value: String(r[keys[0]] ?? ""),
        label: keys.length > 1 ? String(r[keys[1]] ?? r[keys[0]] ?? "") : String(r[keys[0]] ?? ""),
      };
    });
  }, [seedQueryExecution.data]);

  // Track whether the connector was changed in edit mode so we can warn
  // the user that their query may no longer be valid.
  const [connectorChanged, setConnectorChanged] = useState(false);

  const previewQuery = useQueryExecution();
  const allParamValues = useParameterValues();

  // Derive the selected connection object so we can read its type
  const selectedConnection = useMemo(
    () => connections.find((c) => c.id === connectionId) ?? null,
    [connections, connectionId]
  );
  const editorLanguage: "cypher" | "sql" =
    selectedConnection?.type === "postgresql" ? "sql" : "cypher";

  // Chart types compatible with the selected connector
  const compatibleChartTypes = useMemo(
    () =>
      selectedConnection
        ? getCompatibleChartTypes(selectedConnection.type)
        : (Object.keys(chartRegistry) as ChartType[]),
    [selectedConnection]
  );

  // Unified connection-change handler for both add and edit modes.
  // When the new connector makes the current chart type incompatible,
  // reset to "table" (a safe universal default).
  const handleConnectionChange = useCallback(
    (newId: string) => {
      setConnectionId(newId);
      if (mode === "edit") {
        setConnectorChanged(newId !== (widget?.connectionId ?? ""));
      }
      const newConnection = connections.find((c) => c.id === newId);
      if (newConnection) {
        const compatible = getCompatibleChartTypes(newConnection.type);
        if (!compatible.includes(chartType as ChartType)) {
          setChartType("table");
          setChartOptions(getDefaultChartSettings("table"));
        }
      }
    },
    [connections, chartType, mode, widget?.connectionId]
  );

  // Reset state when opening
  useEffect(() => {
    if (open) {
      if (mode === "add") {
        setChartType("bar");
        setConnectionId("");
        setQuery("");
        setTitle("");
        setChartOptions(getDefaultChartSettings("bar"));
        setClickActionEnabled(false);
        setParameterName("");
        setSourceField("");
        setEnableCache(true);
        setCacheTtlMinutes(5);
        setConnectorChanged(false);
        setParamUIType("select");
        setDateSub("single");
        setMultiSelect(false);
        setParamWidgetName("");
        seedQueryExecution.reset();
        previewQuery.reset();
      } else if (widget) {
        setChartType(widget.chartType);
        setConnectionId(widget.connectionId);
        setQuery(widget.query);
        setTitle((widget.settings?.title as string) ?? "");
        setChartOptions(
          (widget.settings?.chartOptions as Record<string, unknown>) ??
            getDefaultChartSettings(widget.chartType)
        );
        const ca = widget.settings?.clickAction as ClickAction | undefined;
        setClickActionEnabled(!!ca);
        setParameterName(ca?.parameterMapping.parameterName ?? "");
        setSourceField(ca?.parameterMapping.sourceField ?? "");
        setEnableCache(widget.settings?.enableCache !== false);
        setCacheTtlMinutes((widget.settings?.cacheTtlMinutes as number | undefined) ?? 5);
        setConnectorChanged(false);

        // Initialize parameter editor state from existing widget
        if (widget.chartType === "parameter-select") {
          const opts = widget.settings?.chartOptions as Record<string, unknown> | undefined;
          const internalType = (opts?.parameterType as string) ?? "select";
          const mapped = reverseParamTypeMapping(internalType);
          setParamUIType(mapped.uiType);
          setDateSub(mapped.dateSub);
          setMultiSelect(mapped.multi);
          setParamWidgetName((opts?.parameterName as string) ?? "");
        } else {
          setParamUIType("select");
          setDateSub("single");
          setMultiSelect(false);
          setParamWidgetName("");
        }

        seedQueryExecution.reset();
        previewQuery.reset();
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, mode, widget]);

  // Re-initialize chart options when chart type changes (add mode only)
  useEffect(() => {
    if (mode === "add") {
      setChartOptions(getDefaultChartSettings(chartType));
    }
  }, [chartType, mode]);

  const handlePreview = useCallback(() => {
    if (connectionId && query.trim()) {
      const referenced = extractReferencedParams(query, allParamValues);
      const params = Object.keys(referenced).length > 0 ? referenced : undefined;
      const connectorType = selectedConnection?.type ?? "neo4j";
      const previewQuery_ = wrapWithPreviewLimit(query, connectorType);
      previewQuery.mutate({ connectionId, query: previewQuery_, params });
    }
  }, [connectionId, query, previewQuery, allParamValues, selectedConnection]);

  // Handles CMD+Shift+Enter (Mac) / Ctrl+Shift+Enter (Win/Linux): run query, then save on success.
  const handleRunAndSave = useCallback(() => {
    if (!query.trim() || saveStatus === "saving") return;
    setSaveStatus("saving");
    previewQuery.mutate(
      { connectionId, query },
      {
        onSuccess: () => {
          // Clear any pending "saved" reset timer before triggering save
          if (savedTimerRef.current !== null) {
            clearTimeout(savedTimerRef.current);
          }
          setSaveStatus("saved");
          savedTimerRef.current = setTimeout(() => {
            setSaveStatus("idle");
            savedTimerRef.current = null;
          }, 1500);
          const id = widget?.id ?? crypto.randomUUID();
          const clickAction: ClickAction | undefined =
            clickActionEnabled && parameterName && sourceField
              ? {
                  type: "set-parameter",
                  parameterMapping: { parameterName, sourceField },
                }
              : undefined;
          onSave({
            id,
            chartType,
            connectionId,
            query,
            params: widget?.params,
            settings: {
              ...(widget?.settings ?? {}),
              title: title || undefined,
              chartOptions,
              clickAction,
              enableCache,
              cacheTtlMinutes,
            },
          });
          onOpenChange(false);
        },
        onError: () => {
          setSaveStatus("idle");
        },
      }
    );
  }, [
    query,
    saveStatus,
    connectionId,
    widget,
    clickActionEnabled,
    parameterName,
    sourceField,
    chartType,
    title,
    chartOptions,
    enableCache,
    cacheTtlMinutes,
    previewQuery,
    onSave,
    onOpenChange,
  ]);

  // Register CMD+Shift+Enter / Ctrl+Shift+Enter on the dialog when it is open.
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key === "Enter") {
        e.preventDefault();
        handleRunAndSave();
      }
    };
    document.addEventListener("keydown", handler);
    return () => {
      document.removeEventListener("keydown", handler);
    };
  }, [open, handleRunAndSave]);

  // Clean up the "saved" feedback timer when the modal is closed.
  useEffect(() => {
    if (!open && savedTimerRef.current !== null) {
      clearTimeout(savedTimerRef.current);
      savedTimerRef.current = null;
      setSaveStatus("idle");
    }
  }, [open]);

  // Derive available fields from preview query results
  const availableFields = useMemo(() => {
    if (!previewQuery.data?.data) return [];
    const data = previewQuery.data.data;
    if (Array.isArray(data) && data.length > 0 && typeof data[0] === "object" && data[0] !== null) {
      return Object.keys(data[0] as Record<string, unknown>);
    }
    return [];
  }, [previewQuery.data]);

  const isParamSelect = chartType === "parameter-select";

  function handleSave() {
    const id = widget?.id ?? crypto.randomUUID();
    const clickAction: ClickAction | undefined =
      !isParamSelect && clickActionEnabled && parameterName && sourceField
        ? {
            type: "set-parameter",
            parameterMapping: { parameterName, sourceField },
          }
        : undefined;
    const resolvedChartOptions = isParamSelect
      ? {
          ...chartOptions,
          parameterType: resolveInternalParamType(paramUIType, dateSub, multiSelect),
          parameterName: paramWidgetName,
          seedQuery: paramUIType === "select" ? (chartOptions.seedQuery ?? "") : undefined,
        }
      : chartOptions;
    onSave({
      id,
      chartType,
      connectionId: isParamSelect && paramUIType !== "select" ? "" : connectionId,
      query: isParamSelect ? "" : query,
      params: widget?.params,
      settings: {
        ...(widget?.settings ?? {}),
        title: title || undefined,
        chartOptions: resolvedChartOptions,
        clickAction,
        enableCache: isParamSelect ? undefined : enableCache,
        cacheTtlMinutes: isParamSelect ? undefined : cacheTtlMinutes,
      },
    });
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="full" className="max-h-[90vh] flex flex-col overflow-hidden">
        <DialogHeader>
          <DialogTitle>
            {mode === "edit" ? "Edit Widget" : "Add Widget"}
          </DialogTitle>
        </DialogHeader>

        <div className="py-4 min-h-[520px] flex-1 overflow-y-auto" style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) minmax(0, 1fr)", gap: "1.5rem" }}>
          {/* Left column: tabs + settings */}
          <div className="overflow-y-auto max-h-[calc(90vh-180px)] pr-2">
            {/* Widget title — always visible above tabs */}
            <div className="space-y-1.5 mb-4">
              <Label htmlFor="widget-title">Widget Title</Label>
              <Input
                id="widget-title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Optional custom title"
              />
            </div>

            <ChartSettingsPanel
              dataTab={
                <div className="space-y-4">
                  {/* Connection + Chart Type on the same row */}
                  {(!isParamSelect || paramUIType === "select") ? (
                    <div className="grid grid-cols-2 gap-3">
                      {/* Connection */}
                      <div className="space-y-1.5">
                        <Label>Connection <span className="text-destructive">*</span></Label>
                        <Combobox
                          value={connectionId}
                          onChange={handleConnectionChange}
                          options={connections.map((c) => ({
                            value: c.id,
                            label: `${c.name} (${c.type})`,
                          }))}
                          placeholder="Select a connection..."
                          searchPlaceholder="Search connections..."
                          emptyText="No connections found."
                          className="w-full"
                        />
                      </div>
                      {/* Chart Type */}
                      <div className="space-y-1.5">
                        <Label>Chart Type</Label>
                        <Select
                          value={chartType}
                          onValueChange={(t) => {
                            setChartType(t);
                            setChartOptions(getDefaultChartSettings(t));
                          }}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Select chart type..." />
                          </SelectTrigger>
                          <SelectContent>
                            {compatibleChartTypes.map((type) => {
                              const meta = chartTypeMeta[type];
                              const Icon = meta.Icon;
                              return (
                                <SelectItem key={type} value={type}>
                                  <span className="flex items-center gap-2">
                                    <Icon className="h-4 w-4" />
                                    {meta.label}
                                  </span>
                                </SelectItem>
                              );
                            })}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                  ) : (
                    /* Chart Type full-width when no connection is needed */
                    <div className="space-y-1.5">
                      <Label>Chart Type</Label>
                      <Select
                        value={chartType}
                        onValueChange={(t) => {
                          setChartType(t);
                          setChartOptions(getDefaultChartSettings(t));
                        }}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Select chart type..." />
                        </SelectTrigger>
                        <SelectContent>
                          {compatibleChartTypes.map((type) => {
                            const meta = chartTypeMeta[type];
                            const Icon = meta.Icon;
                            return (
                              <SelectItem key={type} value={type}>
                                <span className="flex items-center gap-2">
                                  <Icon className="h-4 w-4" />
                                  {meta.label}
                                </span>
                              </SelectItem>
                            );
                          })}
                        </SelectContent>
                      </Select>
                    </div>
                  )}

                  {/* Connector-changed warning */}
                  {!isParamSelect && connectorChanged && (
                    <Alert variant="default" className="py-2">
                      <AlertTriangle className="h-4 w-4" />
                      <AlertTitle className="text-sm">Connector changed</AlertTitle>
                      <AlertDescription className="text-xs">
                        Switching connectors may make the existing query invalid.
                        Review the query before saving.
                      </AlertDescription>
                    </Alert>
                  )}

                  {/* ── Parameter config (when parameter-select) ── */}
                  {isParamSelect && (
                    <div className="space-y-4" data-testid="param-config-section">
                      {/* Parameter Type dropdown */}
                      <div className="space-y-1.5">
                        <Label>Parameter Type</Label>
                        <Select
                          value={paramUIType}
                          onValueChange={(v) => setParamUIType(v as ParamUIType)}
                        >
                          <SelectTrigger data-testid="param-type-select">
                            <SelectValue placeholder="Select parameter type..." />
                          </SelectTrigger>
                          <SelectContent>
                            {paramTypes.map((type) => {
                              const m = paramTypeMeta[type];
                              const Icon = m.Icon;
                              return (
                                <SelectItem key={type} value={type}>
                                  <span className="flex items-center gap-2">
                                    <Icon className="h-4 w-4" />
                                    {m.label}
                                  </span>
                                </SelectItem>
                              );
                            })}
                          </SelectContent>
                        </Select>
                      </div>

                      {/* Date mode (only for date) */}
                      {paramUIType === "date" && (
                        <div className="space-y-1.5">
                          <Label>Date Mode</Label>
                          <Select value={dateSub} onValueChange={(v) => setDateSub(v as DateSubType)}>
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="single">Single Date</SelectItem>
                              <SelectItem value="range">Date Range</SelectItem>
                              <SelectItem value="relative">Relative Date</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                      )}

                      {/* Multi-select toggle (only for select) */}
                      {paramUIType === "select" && (
                        <div className="flex items-center gap-2">
                          <Checkbox
                            id="multi-select-toggle"
                            checked={multiSelect}
                            onCheckedChange={(checked) => setMultiSelect(!!checked)}
                          />
                          <Label htmlFor="multi-select-toggle" className="text-sm">
                            Allow multiple selections
                          </Label>
                        </div>
                      )}

                      {/* Seed Query (only for select type) */}
                      {paramUIType === "select" && (
                        <div className="space-y-1.5">
                          <Label htmlFor="seed-query">Seed Query <span className="text-destructive">*</span></Label>
                          <p className="text-xs text-muted-foreground">
                            Use columns named <code className="bg-muted px-1 rounded">value</code> and <code className="bg-muted px-1 rounded">label</code> (recommended), or first column = value, second = label
                          </p>
                          <SeedQueryInput
                            value={(chartOptions.seedQuery as string) ?? ""}
                            onChange={(v) => setChartOptions((prev) => ({ ...prev, seedQuery: v }))}
                            placeholder="SELECT DISTINCT value FROM table ORDER BY value"
                          />
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className="mt-2"
                            disabled={!connectionId || !(chartOptions.seedQuery as string)?.trim()}
                            onClick={() => {
                              const sq = (chartOptions.seedQuery as string) ?? "";
                              if (connectionId && sq.trim()) {
                                seedQueryExecution.mutate({ connectionId, query: sq });
                              }
                            }}
                          >
                            {seedQueryExecution.isPending ? "Running..." : "Test Seed Query"}
                          </Button>
                          {seedQueryExecution.isError && (
                            <p className="text-xs text-destructive mt-1">
                              {seedQueryExecution.error.message}
                            </p>
                          )}
                          {seedPreviewOptions && seedPreviewOptions.length > 0 && (
                            <p className="text-xs text-muted-foreground mt-1">
                              {seedPreviewOptions.length} option{seedPreviewOptions.length !== 1 ? "s" : ""} loaded — see preview
                            </p>
                          )}
                        </div>
                      )}

                      {/* Parameter Name */}
                      <div className="space-y-1.5">
                        <Label htmlFor="param-widget-name">Parameter Name <span className="text-destructive">*</span></Label>
                        <Input
                          id="param-widget-name"
                          value={paramWidgetName}
                          onChange={(e) => setParamWidgetName(e.target.value)}
                          placeholder="e.g. country"
                        />
                        <p className="text-xs text-muted-foreground">
                          Used to reference this parameter in widget queries
                        </p>
                      </div>

                      {/* Reference hint */}
                      {paramWidgetName && (
                        <div className="border-t pt-4" data-testid="param-reference-hint">
                          <h4 className="text-sm font-medium mb-2">Reference in queries</h4>
                          <div className="space-y-1.5 text-xs text-muted-foreground">
                            <p>
                              Other widgets can use this parameter as:{" "}
                              <code className="bg-muted px-1 py-0.5 rounded text-foreground">
                                $param_{paramWidgetName}
                              </code>
                            </p>
                            {paramUIType === "date" && (dateSub === "range" || dateSub === "relative") && (
                              <p>
                                Date range sub-parameters:{" "}
                                <code className="bg-muted px-1 py-0.5 rounded text-foreground">$param_{paramWidgetName}_from</code>,{" "}
                                <code className="bg-muted px-1 py-0.5 rounded text-foreground">$param_{paramWidgetName}_to</code>
                              </p>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {/* ── Query editor (non-parameter types) ── */}
                  {!isParamSelect && (
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
                        onChange={setQuery}
                        onRun={handlePreview}
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
                  )}
                </div>
              }
              styleTab={
                <ChartOptionsPanel
                  chartType={chartType}
                  settings={chartOptions}
                  onSettingsChange={setChartOptions}
                />
              }
              advancedTab={
                isParamSelect ? (
                  <p className="text-sm text-muted-foreground">
                    No advanced options for parameter widgets.
                  </p>
                ) : (
                  <div className="space-y-4">
                    {/* Caching */}
                    <div className="space-y-4">
                      <h4 className="text-xs font-medium uppercase text-muted-foreground tracking-wider">
                        Caching
                      </h4>
                      <div className="flex items-center gap-2">
                        <Checkbox
                          id="enable-cache"
                          checked={enableCache}
                          onCheckedChange={(checked) => setEnableCache(!!checked)}
                        />
                        <Label htmlFor="enable-cache" className="text-sm">
                          Cache query results
                        </Label>
                      </div>
                      {enableCache && (
                        <div className="pl-6 space-y-1.5">
                          <Label htmlFor="cache-ttl" className="text-sm">
                            Cache timeout (minutes)
                          </Label>
                          <Input
                            id="cache-ttl"
                            type="number"
                            min={1}
                            max={1440}
                            value={cacheTtlMinutes}
                            onChange={(e) =>
                              setCacheTtlMinutes(Math.max(1, Number(e.target.value)))
                            }
                            className="w-24"
                          />
                          <p className="text-xs text-muted-foreground">
                            Results are reused for up to {cacheTtlMinutes} minute{cacheTtlMinutes !== 1 ? "s" : ""} before re-querying.
                          </p>
                        </div>
                      )}
                    </div>

                    {/* Interactivity */}
                    <div className="space-y-4 border-t pt-4">
                      <h4 className="text-xs font-medium uppercase text-muted-foreground tracking-wider">
                        Interactivity
                      </h4>
                      <div className="flex items-center gap-2">
                        <Checkbox
                          id="click-action-enabled"
                          checked={clickActionEnabled}
                          onCheckedChange={(checked) => setClickActionEnabled(!!checked)}
                        />
                        <Label htmlFor="click-action-enabled" className="text-sm">
                          Enable click action
                        </Label>
                      </div>
                      {clickActionEnabled && (
                        <div className="space-y-3 pl-6">
                          <div className="space-y-1.5">
                            <Label htmlFor="param-name">Parameter Name</Label>
                            <Input
                              id="param-name"
                              value={parameterName}
                              onChange={(e) => setParameterName(e.target.value)}
                              placeholder={`param_${(title || chartType).toLowerCase().replace(/\s+/g, "_")}`}
                            />
                            <p className="text-xs text-muted-foreground">
                              Other widgets can reference this as <code>$param_{parameterName || "name"}</code> in their queries.
                            </p>
                          </div>
                          <div className="space-y-1.5">
                            <Label htmlFor="source-field">Source Field</Label>
                            {availableFields.length > 0 ? (
                              <Select value={sourceField} onValueChange={setSourceField}>
                                <SelectTrigger id="source-field">
                                  <SelectValue placeholder="Select a field..." />
                                </SelectTrigger>
                                <SelectContent>
                                  {availableFields.map((f) => (
                                    <SelectItem key={f} value={f}>
                                      {f}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            ) : (
                              <Input
                                id="source-field"
                                value={sourceField}
                                onChange={(e) => setSourceField(e.target.value)}
                                placeholder="name"
                              />
                            )}
                            <p className="text-xs text-muted-foreground">
                              The data field whose value is sent when a chart element is clicked.
                            </p>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                )
              }
            />
          </div>

          {/* Right column: preview */}
          <div className="flex flex-col gap-2">
            <Label className="mb-0">Preview</Label>
            {!isParamSelect && previewQuery.isError && (
              <Alert variant="destructive" className="mb-2">
                <AlertCircle className="h-4 w-4" />
                <AlertTitle>Query Failed</AlertTitle>
                <AlertDescription className="space-y-1">
                  <p>{previewQuery.error.message}</p>
                  <p className="text-xs font-mono opacity-70 truncate" title={query}>
                    {query}
                  </p>
                </AlertDescription>
              </Alert>
            )}

            <div className="h-[500px] flex-shrink-0 overflow-hidden border rounded-lg relative">
              {isParamSelect ? (
                <div className="h-full flex items-center justify-center p-6" data-testid="param-preview">
                  <div className="w-full max-w-xs space-y-3">
                    <Label className="text-xs text-muted-foreground block">
                      {paramWidgetName ? `$param_${paramWidgetName}` : "Parameter preview"}
                    </Label>
                    {paramUIType === "freetext" && (
                      <TextInputParameter
                        parameterName={paramWidgetName || "preview"}
                        value=""
                        onChange={() => {}}
                        placeholder={
                          (chartOptions.placeholder as string) || "Type a value..."
                        }
                      />
                    )}
                    {paramUIType === "date" && dateSub === "single" && (
                      <DatePickerParameter
                        parameterName={paramWidgetName || "preview"}
                        value=""
                        onChange={() => {}}
                      />
                    )}
                    {paramUIType === "date" && dateSub === "range" && (
                      <DateRangeParameter
                        parameterName={paramWidgetName || "preview"}
                        from=""
                        to=""
                        onChange={() => {}}
                      />
                    )}
                    {paramUIType === "date" && dateSub === "relative" && (
                      <DateRelativePicker
                        parameterName={paramWidgetName || "preview"}
                        value=""
                        onChange={() => {}}
                      />
                    )}
                    {paramUIType === "select" && !multiSelect && (
                      <ParamSelector
                        parameterName={paramWidgetName || "preview"}
                        value=""
                        onChange={() => {}}
                        options={seedPreviewOptions ?? [
                          { value: "option-1", label: "Option 1" },
                          { value: "option-2", label: "Option 2" },
                          { value: "option-3", label: "Option 3" },
                        ]}
                        loading={seedQueryExecution.isPending}
                        placeholder={
                          (chartOptions.placeholder as string) || "Select..."
                        }
                      />
                    )}
                    {paramUIType === "select" && multiSelect && (
                      <ParamMultiSelector
                        parameterName={paramWidgetName || "preview"}
                        values={[]}
                        onChange={() => {}}
                        options={seedPreviewOptions ?? [
                          { value: "option-1", label: "Option 1" },
                          { value: "option-2", label: "Option 2" },
                          { value: "option-3", label: "Option 3" },
                        ]}
                        loading={seedQueryExecution.isPending}
                        placeholder={
                          (chartOptions.placeholder as string) || "Select..."
                        }
                      />
                    )}
                  </div>
                </div>
              ) : (
                <>
                  {previewQuery.isPending && (
                    <div className="absolute inset-0 z-10 flex items-center justify-center bg-background/60 backdrop-blur-sm rounded-lg">
                      <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
                    </div>
                  )}
                  {previewQuery.data ? (
                    <CardContainer
                      widget={{
                        id: "preview",
                        chartType,
                        connectionId,
                        query,
                        settings: { chartOptions },
                      }}
                      previewData={previewQuery.data.data}
                      previewResultId={previewQuery.data.resultId}
                    />
                  ) : (
                    <div className="h-full flex items-center justify-center text-sm text-muted-foreground">
                      Run a query to see the preview
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
          >
            Cancel
          </Button>
          <LoadingButton
            type="button"
            disabled={
              isParamSelect
                ? !paramWidgetName.trim() ||
                  (paramUIType === "select" && (!connectionId || !(chartOptions.seedQuery as string)?.trim()))
                : !query.trim()
            }
            loading={saveStatus === "saving"}
            loadingText="Saving..."
            onClick={handleSave}
          >
            {saveStatus === "saved"
              ? "Saved!"
              : mode === "edit"
                ? "Save Changes"
                : "Add Widget"}
          </LoadingButton>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
