"use client";

import React, { useState, useCallback, useEffect, useMemo, useRef } from "react";
import { CardContainer } from "./card-container";
import { useQueryExecution } from "@/hooks/use-query-execution";
import type { DashboardWidget, ClickAction } from "@/lib/db/schema";
import type { ConnectionListItem } from "@/hooks/use-connections";
import { Play, ChevronLeft, AlertCircle } from "lucide-react";
import {
  ChartOptionsPanel,
  getDefaultChartSettings,
  Button,
  Input,
  Label,
  Textarea,
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
} from "@neoboard/components";
import {
  LoadingButton,
  ChartTypePicker,
} from "@neoboard/components";

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

export function WidgetEditorModal({
  open,
  onOpenChange,
  mode,
  widget,
  connections,
  onSave,
}: WidgetEditorModalProps) {
  const [step, setStep] = useState<1 | 2>(mode === "edit" ? 2 : 1);
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

  const previewQuery = useQueryExecution();

  // Reset state when opening
  useEffect(() => {
    if (open) {
      if (mode === "add") {
        setStep(1);
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
        previewQuery.reset();
      } else if (widget) {
        setStep(2);
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
      previewQuery.mutate({ connectionId, query });
    }
  }, [connectionId, query, previewQuery]);

  // Handles CMD+Shift+Enter (Mac) / Ctrl+Shift+Enter (Win/Linux): run query, then save on success.
  const handleRunAndSave = useCallback(() => {
    if (step !== 2 || !query.trim() || saveStatus === "saving") return;
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
    step,
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

  // Register CMD+Shift+Enter / Ctrl+Shift+Enter on the dialog when it is open and on step 2.
  useEffect(() => {
    if (!open || step !== 2) return;
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
  }, [open, step, handleRunAndSave]);

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
      <DialogContent
        className={step === 2 ? "sm:max-w-6xl" : "sm:max-w-md"}
      >
        {step === 1 ? (
          <>
            <DialogHeader>
              <DialogTitle>Add Widget — Select Type</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label>Chart Type</Label>
                <ChartTypePicker
                  value={chartType}
                  onValueChange={setChartType}
                />
              </div>
              <div className="space-y-2">
                <Label>Connection</Label>
                <Combobox
                  value={connectionId}
                  onChange={setConnectionId}
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
            </div>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
              >
                Cancel
              </Button>
              <Button
                type="button"
                disabled={!connectionId}
                onClick={() => setStep(2)}
              >
                Next
              </Button>
            </DialogFooter>
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>
                {mode === "edit" ? "Edit Widget" : "Add Widget — Configure"}
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

                <div className="space-y-1.5">
                  <Label htmlFor="editor-query">Query</Label>
                  <Textarea
                    id="editor-query"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="MATCH (n) RETURN n.name AS name, n.born AS value LIMIT 10"
                    className="font-mono min-h-[100px]"
                    rows={4}
                  />
                </div>

                <div className="flex items-center gap-2">
                  <LoadingButton
                    type="button"
                    variant="secondary"
                    size="sm"
                    loading={previewQuery.isPending}
                    loadingText="Running..."
                    disabled={!query.trim()}
                    onClick={handlePreview}
                  >
                    <Play className="mr-2 h-4 w-4" />
                    Run Query
                  </LoadingButton>
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
              {mode === "add" && (
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setStep(1);
                    previewQuery.reset();
                  }}
                >
                  <ChevronLeft className="mr-2 h-4 w-4" />
                  Back
                </Button>
              )}
              {mode === "edit" && (
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => onOpenChange(false)}
                >
                  Cancel
                </Button>
              )}
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
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
