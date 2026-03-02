"use client";

import React, { useState, useCallback, useEffect, useMemo, useRef } from "react";
import { CardContainer } from "./card-container";
import { useQueryExecution } from "@/hooks/use-query-execution";
import type { DashboardWidget, ClickAction } from "@/lib/db/schema";
import type { ConnectionListItem } from "@/hooks/use-connections";
import { AlertCircle, AlertTriangle } from "lucide-react";
import {
  ChartOptionsPanel,
  ChartSettingsPanel,
  getDefaultChartSettings,
  Badge,
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
import { FormFieldsEditor } from "./widget-editor/form-fields-editor";
import {
  ParameterConfigSection,
  resolveInternalParamType,
  reverseParamTypeMapping,
} from "./widget-editor/parameter-config-section";
import type { ParamUIType, DateSubType } from "./widget-editor/parameter-config-section";
import { ParameterPreview } from "./widget-editor/parameter-preview";
import type { FormFieldDef } from "@/lib/form-field-def";

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
  /** Other widgets on the same page (for form "After Submit" refresh config) */
  otherWidgets?: { id: string; title: string; chartType: string }[];
}

export function WidgetEditorModal({
  open,
  onOpenChange,
  mode,
  widget,
  connections,
  onSave,
  otherWidgets,
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

  // Form fields state (only used when chartType === "form")
  const [formFields, setFormFields] = useState<FormFieldDef[]>(
    () => (widget?.settings?.formFields as FormFieldDef[] | undefined) ?? [],
  );

  // Widget IDs to refresh when this form submits successfully
  const [refreshWidgetIds, setRefreshWidgetIds] = useState<string[]>(
    () =>
      ((widget?.settings?.chartOptions as Record<string, unknown> | undefined)
        ?.refreshWidgetIds as string[] | undefined) ?? [],
  );

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
        setParameterName("");
        setSourceField("");
        setEnableCache(true);
        setCacheTtlMinutes(5);
        setConnectorChanged(false);
        setParamUIType("select");
        setDateSub("single");
        setMultiSelect(false);
        setParamWidgetName("");
        setFormFields([]);
        setRefreshWidgetIds([]);
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

        // Initialize form fields from existing widget
        setFormFields(
          (widget.settings?.formFields as FormFieldDef[] | undefined) ?? [],
        );

        // Initialize refresh widget IDs from existing form widget options
        setRefreshWidgetIds(
          ((widget.settings?.chartOptions as Record<string, unknown> | undefined)
            ?.refreshWidgetIds as string[] | undefined) ?? [],
        );

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
              formFields: chartType === "form" ? formFields : undefined,
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
    formFields,
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
  const isForm = chartType === "form";

  function handleSave() {
    const id = widget?.id ?? crypto.randomUUID();
    const clickAction: ClickAction | undefined =
      !isParamSelect && !isForm && clickActionEnabled && parameterName && sourceField
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
        chartOptions: isForm
          ? {
              ...chartOptions,
              refreshWidgetIds:
                refreshWidgetIds.length > 0 ? refreshWidgetIds : undefined,
            }
          : resolvedChartOptions,
        formFields: isForm ? formFields : undefined,
        clickAction: (isParamSelect || isForm) ? undefined : clickAction,
        enableCache: (isParamSelect || isForm) ? undefined : enableCache,
        cacheTtlMinutes: (isParamSelect || isForm) ? undefined : cacheTtlMinutes,
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
                    showConnection={isForm || !isParamSelect || paramUIType === "select"}
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
                      onRun={isForm ? undefined : handlePreview}
                      editorLanguage={editorLanguage}
                      connectionId={connectionId}
                    />
                  )}

                  {/* Form fields editor (form type only) */}
                  {isForm && (
                    <FormFieldsEditor
                      fields={formFields}
                      onChange={setFormFields}
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
                ) : isForm ? (
                  <div className="space-y-4">
                    <h4 className="text-xs font-medium uppercase text-muted-foreground tracking-wider">
                      After Submit
                    </h4>
                    <p className="text-xs text-muted-foreground">
                      Refresh these widgets when the form submits successfully.
                    </p>
                    {otherWidgets && otherWidgets.length > 0 ? (
                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="text-xs text-muted-foreground">
                            {refreshWidgetIds.length} of {otherWidgets.length} selected
                          </span>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="h-6 text-xs px-2"
                            onClick={() => {
                              const allSelected = otherWidgets.every((w) =>
                                refreshWidgetIds.includes(w.id),
                              );
                              setRefreshWidgetIds(
                                allSelected ? [] : otherWidgets.map((w) => w.id),
                              );
                            }}
                          >
                            {otherWidgets.every((w) => refreshWidgetIds.includes(w.id))
                              ? "Deselect all"
                              : "Select all"}
                          </Button>
                        </div>
                        {otherWidgets.map((w) => (
                          <div key={w.id} className="flex items-center gap-2">
                            <Checkbox
                              id={`refresh-widget-${w.id}`}
                              checked={refreshWidgetIds.includes(w.id)}
                              onCheckedChange={(checked) => {
                                if (checked) {
                                  setRefreshWidgetIds((prev) => [...prev, w.id]);
                                } else {
                                  setRefreshWidgetIds((prev) =>
                                    prev.filter((id) => id !== w.id),
                                  );
                                }
                              }}
                            />
                            <Label
                              htmlFor={`refresh-widget-${w.id}`}
                              className="text-sm flex items-center gap-1.5"
                            >
                              {w.title || "(untitled)"}
                              <Badge variant="outline" className="text-xs font-normal">
                                {chartRegistry[w.chartType as ChartType]?.label ?? w.chartType}
                              </Badge>
                            </Label>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-xs text-muted-foreground">
                        No other widgets on this page.
                      </p>
                    )}
                  </div>
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
            {!isParamSelect && !isForm && previewQuery.isError && (
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
              ) : isForm ? (
                formFields.length > 0 ? (
                  <div className="p-4 space-y-3 overflow-auto h-full">
                    {formFields.map((f) => (
                      <div key={f.id} className="space-y-1.5">
                        <Label className="text-sm">{f.label || f.parameterName}</Label>
                        <div className="h-8 rounded-md border bg-muted/30 flex items-center px-3 text-xs text-muted-foreground">
                          {f.parameterType}
                        </div>
                      </div>
                    ))}
                    <Button disabled className="w-full mt-2">
                      {(chartOptions.submitButtonText as string) || "Submit"}
                    </Button>
                  </div>
                ) : (
                  <div className="h-full flex items-center justify-center text-sm text-muted-foreground p-4 text-center">
                    Add fields in the Fields section below to see the form preview
                  </div>
                )
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
                : isForm
                  ? !connectionId || !query.trim()
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
