"use client";

import { useState, useCallback, useEffect } from "react";
import { CardContainer } from "./card-container";
import { useQueryExecution } from "@/hooks/use-query-execution";
import type { DashboardWidget } from "@/lib/db/schema";
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

  function handleSave() {
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
                <Select value={connectionId} onValueChange={setConnectionId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select a connection..." />
                  </SelectTrigger>
                  <SelectContent>
                    {connections.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.name} ({c.type})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
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
                  <h4 className="text-sm font-medium mb-3">Chart Options</h4>
                  <ChartOptionsPanel
                    chartType={chartType}
                    settings={chartOptions}
                    onSettingsChange={setChartOptions}
                  />
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

                <div className="flex-1 border rounded-lg overflow-hidden min-h-[300px]">
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
              <Button
                type="button"
                disabled={!query.trim()}
                onClick={handleSave}
              >
                {mode === "edit" ? "Save Changes" : "Add Widget"}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
