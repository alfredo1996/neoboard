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
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import {
  ChartOptionsPanel,
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
} from "@neoboard/components";
import {
  getCompatibleChartTypes,
  chartRegistry,
} from "@/lib/chart-registry";
import type { ChartType } from "@/lib/chart-registry";
import { useParameterValues } from "@/stores/parameter-store";
import { extractReferencedParams } from "@/hooks/use-widget-query";

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
      previewQuery.mutate({ connectionId, query, params });
    }
  }, [connectionId, query, previewQuery, allParamValues]);

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

  function handleSave() {
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
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-6xl">
        <DialogHeader>
          <DialogTitle>
            {mode === "edit" ? "Edit Widget" : "Add Widget"}
          </DialogTitle>
        </DialogHeader>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 py-4 min-h-[450px]">
          {/* Left column: settings */}
          <div className="space-y-4 overflow-y-auto max-h-[500px] pr-2">
            <div className="space-y-1.5">
              <Label htmlFor="widget-title">Widget Title</Label>
              <Input
                id="widget-title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Optional custom title"
              />
            </div>

            {/* Connection selector — always visible */}
            <div className="space-y-1.5">
              <Label>Connection</Label>
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
              {connectorChanged && (
                <Alert variant="default" className="mt-1 py-2">
                  <AlertTriangle className="h-4 w-4" />
                  <AlertTitle className="text-sm">Connector changed</AlertTitle>
                  <AlertDescription className="text-xs">
                    Switching connectors may make the existing query invalid.
                    Review the query before saving.
                  </AlertDescription>
                </Alert>
              )}
            </div>

            {/* Chart type dropdown with icons */}
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

            <div className="space-y-1.5">
              <Label htmlFor="editor-query">Query</Label>
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
                className="min-h-[160px]"
              />
            </div>

            <div className="border-t pt-4">
              <h4 className="text-sm font-medium mb-3">Data Settings</h4>
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <Checkbox
                    id="enable-cache"
                    checked={enableCache}
                    onCheckedChange={(checked) => setEnableCache(!!checked)}
                  />
                  <Label htmlFor="enable-cache" className="text-sm">
                    Cache results
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
            </div>

            <div className="border-t pt-4">
              <h4 className="text-sm font-medium mb-3">Chart Options</h4>
              <ChartOptionsPanel
                chartType={chartType}
                settings={chartOptions}
                onSettingsChange={setChartOptions}
              />
            </div>

            {chartType === "parameter-select" && (() => {
              const pType = (chartOptions.parameterType as string) ?? "select";
              const pName = (chartOptions.parameterName as string) ?? "";
              const needsSeedQuery = pType === "select" || pType === "multi-select" || pType === "cascading-select";
              return (
                <>
                  {needsSeedQuery && (
                    <div className="border-t pt-4">
                      <h4 className="text-sm font-medium mb-3">Seed Query</h4>
                      <p className="text-xs text-muted-foreground mb-2">
                        Query that populates the dropdown options. Must return at least one column (used as value); the second column (if present) is used as the display label.
                      </p>
                      <SeedQueryInput
                        value={(chartOptions.seedQuery as string) ?? ""}
                        onChange={(v) => setChartOptions((prev) => ({ ...prev, seedQuery: v }))}
                        placeholder={pType === "cascading-select"
                          ? "SELECT value, label FROM table WHERE parent_id = $param_parent"
                          : "SELECT DISTINCT value FROM table ORDER BY value"}
                      />
                    </div>
                  )}
                  {pName && (
                    <div className="border-t pt-4" data-testid="param-reference-hint">
                      <h4 className="text-sm font-medium mb-2">Reference in queries</h4>
                      <div className="space-y-1.5 text-xs text-muted-foreground">
                        <p>
                          Other widgets can use this parameter in their queries as:{" "}
                          <code className="bg-muted px-1 py-0.5 rounded text-foreground">
                            $param_{pName}
                          </code>
                        </p>
                        {(pType === "date-range" || pType === "date-relative") && (
                          <p>
                            Date range sub-parameters:{" "}
                            <code className="bg-muted px-1 py-0.5 rounded text-foreground">$param_{pName}_from</code>,{" "}
                            <code className="bg-muted px-1 py-0.5 rounded text-foreground">$param_{pName}_to</code>
                          </p>
                        )}
                        {pType === "number-range" && (
                          <p>
                            Number range sub-parameters:{" "}
                            <code className="bg-muted px-1 py-0.5 rounded text-foreground">$param_{pName}_min</code>,{" "}
                            <code className="bg-muted px-1 py-0.5 rounded text-foreground">$param_{pName}_max</code>
                          </p>
                        )}
                      </div>
                    </div>
                  )}
                </>
              );
            })()}

            <div className="border-t pt-4">
              <div className="flex items-center gap-2 mb-3">
                <Checkbox
                  id="click-action-enabled"
                  checked={clickActionEnabled}
                  onCheckedChange={(checked) => setClickActionEnabled(!!checked)}
                />
                <Label htmlFor="click-action-enabled" className="text-sm font-medium">
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

          {/* Right column: preview */}
          <div className="flex flex-col">
            <Label className="mb-2">Preview</Label>
            {previewQuery.isError && (
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

            <div className="flex-1 border rounded-lg overflow-hidden min-h-[300px] relative">
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
            disabled={!query.trim()}
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
