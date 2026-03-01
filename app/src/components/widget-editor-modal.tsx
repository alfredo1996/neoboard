"use client";

import React, { useState, useCallback, useEffect, useMemo, useRef } from "react";
import { CardContainer } from "./card-container";
import { useQueryExecution } from "@/hooks/use-query-execution";
import type { DashboardWidget, DashboardLayoutV2, ClickAction } from "@/lib/db/schema";
import type { ConnectionListItem } from "@/hooks/use-connections";
import { collectParameterNames } from "@/lib/collect-parameter-names";
import { AlertCircle, AlertTriangle } from "lucide-react";
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
  CreatableCombobox,
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

import { ChartTypeSelector } from "./widget-editor/chart-type-selector";
import { QueryEditorPanel } from "./widget-editor/query-editor-panel";
import {
  ParameterConfigSection,
  resolveInternalParamType,
  reverseParamTypeMapping,
} from "./widget-editor/parameter-config-section";
import type { ParamUIType, DateSubType } from "./widget-editor/parameter-config-section";
import { ParameterPreview } from "./widget-editor/parameter-preview";

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
  /** Dashboard layout — used for page list and parameter name suggestions */
  layout?: DashboardLayoutV2;
}

export function WidgetEditorModal({
  open,
  onOpenChange,
  mode,
  widget,
  connections,
  onSave,
  layout,
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
  const [clickActionType, setClickActionType] = useState<ClickAction["type"]>(
    existingClickAction?.type ?? "set-parameter"
  );
  const [parameterName, setParameterName] = useState(
    existingClickAction?.parameterMapping?.parameterName ?? ""
  );
  const [sourceField, setSourceField] = useState(
    existingClickAction?.parameterMapping?.sourceField ?? ""
  );
  const [targetPageId, setTargetPageId] = useState(
    existingClickAction?.targetPageId ?? ""
  );

  // Parameter name suggestions from the dashboard layout
  const parameterSuggestions = useMemo(
    () => (layout ? collectParameterNames(layout) : []),
    [layout]
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

  const handleChartTypeChange = useCallback(
    (t: string) => {
      setChartType(t);
      if (mode === "edit") {
        setChartOptions(getDefaultChartSettings(t));
      }
    },
    [mode]
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
        setClickActionType("set-parameter");
        setParameterName("");
        setSourceField("");
        setTargetPageId("");
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
        setClickActionType(ca?.type ?? "set-parameter");
        setParameterName(ca?.parameterMapping?.parameterName ?? "");
        setSourceField(ca?.parameterMapping?.sourceField ?? "");
        setTargetPageId(ca?.targetPageId ?? "");
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

  // Build click action from current editor state
  const buildClickAction = useCallback((): ClickAction | undefined => {
    if (!clickActionEnabled || chartType === "parameter-select") return undefined;
    const needsParam = clickActionType === "set-parameter" || clickActionType === "set-parameter-and-navigate";
    const needsPage = clickActionType === "navigate-to-page" || clickActionType === "set-parameter-and-navigate";
    if (needsParam && !parameterName) return undefined;
    // For tables, sourceField is empty (cell-click provides the value directly)
    const resolvedSourceField = chartType === "table" ? "" : sourceField;
    if (needsParam && chartType !== "table" && !resolvedSourceField) return undefined;
    if (needsPage && !targetPageId) return undefined;
    return {
      type: clickActionType,
      ...(needsParam ? { parameterMapping: { parameterName, sourceField: resolvedSourceField } } : {}),
      ...(needsPage ? { targetPageId } : {}),
    };
  }, [clickActionEnabled, clickActionType, parameterName, sourceField, chartType, targetPageId]);

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
          if (savedTimerRef.current !== null) {
            clearTimeout(savedTimerRef.current);
          }
          setSaveStatus("saved");
          savedTimerRef.current = setTimeout(() => {
            setSaveStatus("idle");
            savedTimerRef.current = null;
          }, 1500);
          const id = widget?.id ?? crypto.randomUUID();
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
              clickAction: buildClickAction(),
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
    buildClickAction,
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
    const clickAction = buildClickAction();
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
      <DialogContent size="full" className="max-w-[1200px] max-h-[90vh] flex flex-col overflow-hidden">
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
                  <ChartTypeSelector
                    connectionId={connectionId}
                    onConnectionChange={handleConnectionChange}
                    chartType={chartType}
                    onChartTypeChange={handleChartTypeChange}
                    compatibleChartTypes={compatibleChartTypes}
                    connections={connections}
                    showConnection={!isParamSelect || paramUIType === "select"}
                  />

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

                  {/* Parameter config (when parameter-select) */}
                  {isParamSelect && (
                    <ParameterConfigSection
                      paramUIType={paramUIType}
                      onParamUITypeChange={setParamUIType}
                      dateSub={dateSub}
                      onDateSubChange={setDateSub}
                      multiSelect={multiSelect}
                      onMultiSelectChange={setMultiSelect}
                      paramWidgetName={paramWidgetName}
                      onParamWidgetNameChange={setParamWidgetName}
                      chartOptions={chartOptions}
                      onChartOptionsChange={setChartOptions}
                      connectionId={connectionId}
                      seedQueryExecution={seedQueryExecution}
                      seedPreviewOptions={seedPreviewOptions}
                    />
                  )}

                  {/* Query editor (non-parameter types) */}
                  {!isParamSelect && (
                    <QueryEditorPanel
                      chartType={chartType}
                      query={query}
                      onQueryChange={setQuery}
                      onRun={handlePreview}
                      editorLanguage={editorLanguage}
                      connectionId={connectionId}
                    />
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
                          {/* Action type */}
                          <div className="space-y-1.5">
                            <Label htmlFor="click-action-type">Action Type</Label>
                            <Select value={clickActionType} onValueChange={(v) => setClickActionType(v as ClickAction["type"])}>
                              <SelectTrigger id="click-action-type">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="set-parameter">Set Parameter</SelectItem>
                                <SelectItem value="navigate-to-page">Navigate to Page</SelectItem>
                                <SelectItem value="set-parameter-and-navigate">Set Parameter &amp; Navigate</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>

                          {/* Parameter name — shown for set-parameter types */}
                          {(clickActionType === "set-parameter" || clickActionType === "set-parameter-and-navigate") && (
                            <div className="space-y-1.5">
                              <Label htmlFor="param-name">Parameter Name</Label>
                              <CreatableCombobox
                                suggestions={parameterSuggestions}
                                value={parameterName}
                                onChange={setParameterName}
                                placeholder={`param_${(title || chartType).toLowerCase().replace(/\s+/g, "_")}`}
                              />
                              <p className="text-xs text-muted-foreground">
                                Other widgets can reference this as <code>$param_{parameterName || "name"}</code> in their queries.
                              </p>
                            </div>
                          )}

                          {/* Source field — shown for set-parameter types, hidden for tables */}
                          {(clickActionType === "set-parameter" || clickActionType === "set-parameter-and-navigate") && chartType !== "table" && (
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
                          )}

                          {/* Table cell-click info */}
                          {(clickActionType === "set-parameter" || clickActionType === "set-parameter-and-navigate") && chartType === "table" && (
                            <p className="text-xs text-muted-foreground">
                              Tables use cell-click: the clicked cell&apos;s value is sent directly as the parameter value.
                            </p>
                          )}

                          {/* Target page — shown for navigate types */}
                          {(clickActionType === "navigate-to-page" || clickActionType === "set-parameter-and-navigate") && (
                            <div className="space-y-1.5">
                              <Label htmlFor="target-page">Target Page</Label>
                              {layout && layout.pages.length > 1 ? (
                                <Select value={targetPageId} onValueChange={setTargetPageId}>
                                  <SelectTrigger id="target-page">
                                    <SelectValue placeholder="Select a page..." />
                                  </SelectTrigger>
                                  <SelectContent>
                                    {layout.pages.map((p) => (
                                      <SelectItem key={p.id} value={p.id}>
                                        {p.title}
                                      </SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                              ) : (
                                <p className="text-xs text-muted-foreground">
                                  Add more pages to the dashboard to enable navigation.
                                </p>
                              )}
                            </div>
                          )}
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
                <ParameterPreview
                  paramUIType={paramUIType}
                  dateSub={dateSub}
                  multiSelect={multiSelect}
                  paramWidgetName={paramWidgetName}
                  chartOptions={chartOptions}
                  seedPreviewOptions={seedPreviewOptions}
                  seedQueryPending={seedQueryExecution.isPending}
                />
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
