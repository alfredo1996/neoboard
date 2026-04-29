"use client";

import React, {
  useState,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
} from "react";
import { useQueryExecution } from "@/hooks/use-query-execution";
import type {
  DashboardWidget,
  DashboardLayoutV2,
  ClickAction,
  WidgetTemplate,
  StylingConfig,
} from "@/lib/db/schema";
import type { ConnectionListItem } from "@/hooks/use-connections";
import {
  collectParameterNames,
  findParameterCollisions,
  aggregateClickActionParamNames,
} from "@/lib/parameter/collect-parameter-names";
import { AlertTriangle, Info, FlaskConical } from "lucide-react";
import {
  useWidgetTemplates,
  useCreateWidgetTemplate,
  useUpdateWidgetTemplate,
} from "@/hooks/use-widget-templates";

import {
  ChartOptionsPanel,
  ChartSettingsPanel,
  getDefaultChartSettings,
  ColorScalePanel,
  Button,
  Input,
  Label,
  Alert,
  AlertTitle,
  AlertDescription,
  Checkbox,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@neoboard/components";
import {
  getCompatibleChartTypes,
  chartSupportsClickAction,
  chartSupportsStyling,
  getAllChartTypes,
} from "@/lib/plugin/chart-helpers";
import type { ChartType } from "@/lib/plugin/chart-helpers";
import type { ConnectorType } from "@/lib/connector/connector-types";
import { useParameterValues } from "@/stores/parameter-store";
import { wrapWithPreviewLimit } from "@/lib/query/wrap-with-preview-limit";
export { wrapWithPreviewLimit };

import { ChartTypeSelector } from "./widget-editor/chart-type-selector";
import { useBuildWidgetForSave } from "./widget-editor/use-widget-save";
import { QueryEditorPanel } from "./widget-editor/query-editor-panel";
import { FormFieldsEditor } from "./widget-editor/form-fields-editor";
import { ParameterConfigSection } from "./widget-editor/parameter-config-section";
import { ActionRulesEditor } from "./widget-editor/action-rules-editor";
import { StylingRulesEditor } from "./widget-editor/styling-rules-editor";
import { useWidgetEditorStore } from "@/stores/widget-editor-store";
import { TransformEditor } from "./widget-editor/transform-editor";
import { DatabaseSelector } from "./widget-editor/database-selector";
import { TemplateBrowser } from "./widget-editor/template-browser";
import { useAutoPreview } from "./widget-editor/use-auto-preview";
import { AdvancedCachingSection } from "./widget-editor/advanced-caching-section";
import { AdvancedInteractivitySection } from "./widget-editor/advanced-interactivity-section";
import { AdvancedStylingSection } from "./widget-editor/advanced-styling-section";
import { AdvancedFormRefreshSection } from "./widget-editor/advanced-form-refresh-section";
import { LabMetadataForm } from "./widget-editor/lab-metadata-form";
import { ModalFooter } from "./widget-editor/modal-footer";
import { WidgetPreviewPanel } from "./widget-editor/widget-preview-panel";

export interface WidgetEditorModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode: "add" | "edit" | "lab-edit" | "lab-create";
  /** Existing widget to edit (required for edit mode) */
  widget?: DashboardWidget;
  /** Template to edit (required for lab-edit mode) */
  template?: WidgetTemplate;
  /** Available connections */
  connections: ConnectionListItem[];
  /** Called with the final widget data on save (add/edit modes) */
  onSave: (widget: DashboardWidget) => void;
  /** Called after a lab-mode save completes successfully */
  onLabSaved?: () => void;
  /** Dashboard layout — used for page list and parameter name suggestions */
  layout?: DashboardLayoutV2;
  /** Template to auto-apply when opening in add mode (from Widget Lab "Use in Dashboard") */
  initialTemplate?: WidgetTemplate;
  /** Cached query data from the dashboard — shown as preview immediately without re-running */
  initialPreviewData?: { data: unknown; resultId: string };
  /** Whether the current user has write permission. Controls visibility of the write toggle. */
  canWrite?: boolean;
}

export function WidgetEditorModal({
  open,
  onOpenChange,
  mode,
  widget,
  template: templateProp,
  connections,
  onSave,
  onLabSaved,
  layout,
  initialTemplate,
  initialPreviewData,
  canWrite = false,
}: WidgetEditorModalProps) {
  const isLabMode = mode === "lab-edit" || mode === "lab-create";

  // ── Store-backed state (shared with sub-editors) ───────────────────
  // The store is initialized via loadFromWidget/resetForAdd in a useEffect below.
  const chartType = useWidgetEditorStore((s) => s.chartType);
  const setChartType = useWidgetEditorStore((s) => s.setChartType);
  const connectionId = useWidgetEditorStore((s) => s.connectionId);
  const setConnectionId = useWidgetEditorStore((s) => s.setConnectionId);
  const database = useWidgetEditorStore((s) => s.database);
  const setDatabase = useWidgetEditorStore((s) => s.setDatabase);
  const allowWrites = useWidgetEditorStore((s) => s.allowWrites);
  const setAllowWrites = useWidgetEditorStore((s) => s.setAllowWrites);
  const query = useWidgetEditorStore((s) => s.query);
  const chartOptions = useWidgetEditorStore((s) => s.chartOptions);
  const setChartOptions = useWidgetEditorStore((s) => s.setChartOptions);
  const actionRules = useWidgetEditorStore((s) => s.actionRules);
  const formFields = useWidgetEditorStore((s) => s.formFields);
  const paramUIType = useWidgetEditorStore((s) => s.paramUIType);
  const dateSub = useWidgetEditorStore((s) => s.dateSub);
  const multiSelect = useWidgetEditorStore((s) => s.multiSelect);
  const paramWidgetName = useWidgetEditorStore((s) => s.paramWidgetName);
  const transforms = useWidgetEditorStore((s) => s.transforms);
  const setTransforms = useWidgetEditorStore((s) => s.setTransforms);
  const transformsEnabled = useWidgetEditorStore((s) => s.transformsEnabled);
  const setTransformsEnabled = useWidgetEditorStore(
    (s) => s.setTransformsEnabled,
  );

  // ── Store-backed state (formerly local useState) ──────────────────
  const title = useWidgetEditorStore((s) => s.title);
  const setTitle = useWidgetEditorStore((s) => s.setTitle);
  const clickActionEnabled = useWidgetEditorStore((s) => s.clickActionEnabled);
  const setClickActionEnabled = useWidgetEditorStore(
    (s) => s.setClickActionEnabled,
  );
  const parameterName = useWidgetEditorStore((s) => s.parameterName);
  const setStylingEnabled = useWidgetEditorStore((s) => s.setStylingEnabled);
  const colorScales = useWidgetEditorStore((s) => s.colorScales);
  const setColorScales = useWidgetEditorStore((s) => s.setColorScales);
  const dialogStep = useWidgetEditorStore((s) => s.dialogStep);
  const setDialogStep = useWidgetEditorStore((s) => s.setDialogStep);
  const labName = useWidgetEditorStore((s) => s.labName);
  const labDescription = useWidgetEditorStore((s) => s.labDescription);
  const labTagsInput = useWidgetEditorStore((s) => s.labTagsInput);
  const connectorChanged = useWidgetEditorStore((s) => s.connectorChanged);
  const setConnectorChanged = useWidgetEditorStore(
    (s) => s.setConnectorChanged,
  );

  // ── Initialize store when modal opens ────────────────────────────
  // loadFromWidget / resetForAdd sets all store fields from the widget prop.
  // This replaces the old bidirectional sync approach.
  useEffect(() => {
    if (!open) return;
    const store = useWidgetEditorStore.getState();
    if (mode === "edit" && widget) {
      store.loadFromWidget(widget);
    } else if (mode === "lab-edit" && templateProp) {
      // Initialize from template — reset first, then override with template data
      store.resetForAdd();
      store.setChartType(templateProp.chartType);
      store.setConnectionId(templateProp.connectionId ?? "");
      store.setQuery(templateProp.query ?? "");
      store.setTitle((templateProp.settings?.title as string) ?? "");
      store.setChartOptions(
        (templateProp.settings?.chartOptions as Record<string, unknown>) ??
          getDefaultChartSettings(templateProp.chartType),
      );
      store.setLabName(templateProp.name);
      store.setLabDescription(templateProp.description ?? "");
      store.setLabTagsInput((templateProp.tags ?? []).join(", "));
    } else {
      // add or lab-create
      store.resetForAdd();
      // "add" mode defaults to bar chart (more useful default than table)
      if (mode === "add") {
        store.setChartType("bar");
        store.setChartOptions(getDefaultChartSettings("bar"));
      }
      if (mode === "lab-create") {
        store.setLabName("");
        store.setLabDescription("");
        store.setLabTagsInput("");
      }
    }
  }, [open, mode, widget, templateProp]);

  // ── Local-only state (not in store) ────────────────────────────────

  // Build the widget object for saving — shared by handleSave and handleRunAndSave
  const buildWidgetForSave = useBuildWidgetForSave(widget, layout);

  // Lab-mode mutations
  const createTemplate = useCreateWidgetTemplate();
  const updateTemplate = useUpdateWidgetTemplate();
  const previewRef = useRef<HTMLDivElement>(null);
  /** Tracks the initial chartType set when the dialog opens in edit mode.
   *  Used to skip the chart-options reset on first render (preserving saved options)
   *  while still resetting when the user explicitly changes the chart type. */
  const editInitialChartTypeRef = useRef<string | null>(null);

  // Parameter name suggestions from the dashboard layout
  const parameterSuggestions = useMemo(
    () => (layout ? collectParameterNames(layout) : []),
    [layout],
  );

  // Derive other widgets from layout for the "After Submit" refresh config.
  // Includes all widgets across all pages except the widget being edited.
  const otherWidgets = useMemo(() => {
    if (!layout) return [];
    return layout.pages
      .flatMap((p) => p.widgets)
      .filter((w) => w.id !== widget?.id)
      .map((w) => ({
        id: w.id,
        title: (w.settings?.title as string) ?? "",
        chartType: w.chartType,
      }));
  }, [layout, widget?.id]);

  // Widgets that already set the same parameter name (collision warning).
  // Use widget?.id ?? "" so new widgets (no id yet) still get collision checks.
  const paramSelectCollisions = useMemo(
    () =>
      layout
        ? findParameterCollisions(layout, widget?.id ?? "", paramWidgetName)
        : [],
    [layout, widget?.id, paramWidgetName],
  );

  const clickActionCollisions = useMemo(() => {
    if (!layout) return [];
    const names = aggregateClickActionParamNames(
      clickActionEnabled,
      parameterName,
      actionRules,
    );
    const all: ReturnType<typeof findParameterCollisions> = [];
    for (const name of names) {
      for (const c of findParameterCollisions(layout, widget?.id ?? "", name)) {
        if (!all.some((x) => x.widgetId === c.widgetId)) all.push(c);
      }
    }
    return all;
  }, [layout, widget?.id, clickActionEnabled, parameterName, actionRules]);

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
        label:
          keys.length > 1
            ? String(r[keys[1]] ?? r[keys[0]] ?? "")
            : String(r[keys[0]] ?? ""),
      };
    });
  }, [seedQueryExecution.data]);

  const previewQuery = useQueryExecution();
  const allParamValues = useParameterValues();

  // Derive the selected connection object so we can read its type
  const selectedConnection = useMemo(
    () => connections.find((c) => c.id === connectionId) ?? null,
    [connections, connectionId],
  );

  // Template picker — only used in add mode
  const selectedConnectorType = selectedConnection?.type ?? undefined;
  const { data: templates, isLoading: templatesLoading } = useWidgetTemplates(
    mode === "add" && dialogStep === "templates"
      ? { connectorType: selectedConnectorType }
      : undefined,
  );

  // Guard against the add-mode chartType reset effect overwriting template settings
  const applyingTemplateRef = useRef(false);

  function applyTemplate(t: WidgetTemplate) {
    applyingTemplateRef.current = true;
    const store = useWidgetEditorStore.getState();
    // API returns dates as ISO strings (JSON serialization), not Date objects
    useWidgetEditorStore.setState({
      templateId: t.id,
      templateSyncedAt: t.updatedAt
        ? String(t.updatedAt)
        : new Date().toISOString(),
    });
    store.setChartType(t.chartType);
    store.setQuery(t.query ?? "");
    store.setTitle((t.settings?.title as string) ?? "");
    store.setChartOptions(
      (t.settings?.chartOptions as Record<string, unknown>) ??
        getDefaultChartSettings(t.chartType),
    );

    // Auto-populate connector if none selected yet
    if (!connectionId) {
      if (t.connectionId && connections.some((c) => c.id === t.connectionId)) {
        // Prefer the template's bound connection if it exists
        store.setConnectionId(t.connectionId);
      } else if (t.connectorType) {
        // Fall back to first connection of matching type
        const match = connections.find((c) => c.type === t.connectorType);
        if (match) store.setConnectionId(match.id);
      }
    }

    store.setDialogStep("main");
  }
  // Pass connector type directly — the language resolver registry maps it
  // to the right editor extension (e.g., "neo4j" → cypher, "postgresql" → sql).
  const editorLanguage = selectedConnection?.type ?? "cypher";

  // Chart types compatible with the selected connector
  const compatibleChartTypes = useMemo(
    () =>
      selectedConnection
        ? (getCompatibleChartTypes(selectedConnection.type) as ChartType[])
        : (getAllChartTypes() as ChartType[]),
    [selectedConnection],
  );

  // Unified connection-change handler for both add and edit modes.
  const handleConnectionChange = useCallback(
    (newId: string) => {
      const prevConnection = connections.find((c) => c.id === connectionId);
      setConnectionId(newId);
      if (mode === "edit") {
        setConnectorChanged(newId !== (widget?.connectionId ?? ""));
      }
      const newConnection = connections.find((c) => c.id === newId);
      if (newConnection) {
        // Clear query state when switching between different connection types
        // (e.g. neo4j → postgresql) since the query language is incompatible.
        if (prevConnection && prevConnection.type !== newConnection.type) {
          useWidgetEditorStore.getState().clearQueryState();
        }
        const compatible = getCompatibleChartTypes(newConnection.type);
        if (!compatible.includes(chartType as ChartType)) {
          setChartType("table");
          setChartOptions(getDefaultChartSettings("table"));
        }
      }
    },
    [connections, connectionId, chartType, mode, widget?.connectionId],
  );

  const handleChartTypeChange = useCallback(
    (t: string) => {
      setChartType(t);
      // Chart options reset is handled by the chartType useEffect below
      // for all modes (add, edit, lab-create).
      // Auto-disable click action when switching to an unsupported type
      if (!chartSupportsClickAction(t)) {
        setClickActionEnabled(false);
      }
      // Auto-disable styling when switching to an unsupported type
      if (!chartSupportsStyling(t)) {
        setStylingEnabled(false);
      }
    },
    [setChartType],
  );

  // Reset local query execution state and track initial chart type for edit mode.
  // All field initialization is handled by the store initialization effect above.
  useEffect(() => {
    if (open) {
      if (mode === "edit" && widget) {
        editInitialChartTypeRef.current = widget.chartType;
      }
      seedQueryExecution.reset();
      previewQuery.reset();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, mode, widget, templateProp]);

  // Auto-apply a template when opening in add mode with initialTemplate (Widget Lab → Dashboard flow)
  const initialTemplateAppliedRef = useRef<string | undefined>(undefined);
  useEffect(() => {
    if (
      open &&
      mode === "add" &&
      initialTemplate &&
      initialTemplateAppliedRef.current !== initialTemplate.id
    ) {
      initialTemplateAppliedRef.current = initialTemplate.id;
      // Use setTimeout to ensure the add-mode reset runs first
      setTimeout(() => applyTemplate(initialTemplate), 0);
    }
    if (!open) {
      initialTemplateAppliedRef.current = undefined;
      editInitialChartTypeRef.current = null;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, mode, initialTemplate]);

  // Re-initialize chart options when chart type changes.
  // Skip reset when the change comes from applyTemplate to preserve template settings.
  // In edit mode, skip the first render (initial chart type from saved widget) so we
  // don't overwrite the user's persisted style options.
  useEffect(() => {
    if (applyingTemplateRef.current) {
      applyingTemplateRef.current = false;
      return;
    }
    // In edit mode, skip the initial chartType set (dialog just opened with saved type)
    if (editInitialChartTypeRef.current !== null) {
      editInitialChartTypeRef.current = null;
      return;
    }
    setChartOptions(getDefaultChartSettings(chartType));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- refs guard the reset; mode is not needed
  }, [chartType]);

  // Build click action / styling config from the store
  const buildClickAction = useCallback(
    (): ClickAction | undefined =>
      useWidgetEditorStore.getState().buildClickAction(layout),
    [layout],
  );

  const buildStylingConfig = useCallback(
    (): StylingConfig | undefined =>
      useWidgetEditorStore.getState().buildStylingConfig(),
    [],
  );

  const { handlePreview, saveStatus } = useAutoPreview({
    open,
    mode,
    connectionId,
    query,
    chartType,
    allParamValues,
    selectedConnection: selectedConnection ?? undefined,
    initialPreviewData,
    previewQuery,
    buildWidgetForSave,
    onSave,
    onOpenChange,
  });

  // Derive available fields from preview query results
  const availableFields = useMemo(() => {
    const src = previewQuery.data?.data ?? initialPreviewData?.data;
    if (!src) return [];
    if (
      Array.isArray(src) &&
      src.length > 0 &&
      typeof src[0] === "object" &&
      src[0] !== null
    ) {
      return Object.keys(src[0] as Record<string, unknown>);
    }
    return [];
  }, [previewQuery.data, initialPreviewData]);

  // First row of query results — used for column pipeline simulation in TransformEditor
  const sampleRow = useMemo(() => {
    const src = previewQuery.data?.data ?? initialPreviewData?.data;
    if (
      Array.isArray(src) &&
      src.length > 0 &&
      typeof src[0] === "object" &&
      src[0] !== null
    ) {
      return src[0] as Record<string, unknown>;
    }
    return undefined;
  }, [previewQuery.data, initialPreviewData]);

  // Push derived data to the store so sub-editors can access it via selectors.
  // These are computed in the modal but not directly settable by sub-editors.
  useLayoutEffect(() => {
    useWidgetEditorStore.setState({ availableFields });
  }, [availableFields]);
  useLayoutEffect(() => {
    useWidgetEditorStore.setState({ parameterSuggestions });
  }, [parameterSuggestions]);

  const isParamSelect = chartType === "parameter-select";
  const isForm = chartType === "form";
  const isMarkdown = chartType === "markdown";
  const isIframe = chartType === "iframe";
  /** True for widget types that don't need a query or connection. */
  const isContentOnly = isMarkdown || isIframe;

  function handleSave() {
    const widgetToSave = buildWidgetForSave();
    onSave(widgetToSave);
    onOpenChange(false);
  }

  const [labError, setLabError] = useState<string | null>(null);

  async function handleLabSave() {
    if (!labName.trim()) return;
    setLabError(null);

    const selectedConn = connections.find((c) => c.id === connectionId);
    const connectorType: ConnectorType = selectedConn?.type ?? "neo4j";

    const tags = labTagsInput
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean);

    const templateData = {
      name: labName.trim(),
      description: labDescription.trim() || undefined,
      tags: tags.length > 0 ? tags : undefined,
      chartType,
      connectorType,
      connectionId: isContentOnly ? undefined : connectionId || undefined,
      query: isContentOnly ? "" : query,
      settings: {
        title: title || undefined,
        chartOptions,
        stylingConfig: buildStylingConfig(),
        clickAction: buildClickAction(),
        transforms: transforms.length ? transforms : undefined,
        conditionalFormatting: colorScales.length ? { colorScales } : undefined,
      },
    };

    try {
      if (mode === "lab-edit" && templateProp) {
        await updateTemplate.mutateAsync({
          id: templateProp.id,
          ...templateData,
        });
      } else {
        await createTemplate.mutateAsync(templateData);
      }
      onLabSaved?.();
      onOpenChange(false);
    } catch (err) {
      setLabError(
        err instanceof Error ? err.message : "Failed to save template",
      );
    }
  }

  const labSaving = createTemplate.isPending || updateTemplate.isPending;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        size="full"
        className="max-w-[1200px] max-h-[90vh] flex flex-col overflow-hidden"
        onInteractOutside={() => onOpenChange(false)}
      >
        {dialogStep === "styling-rules" ? (
          <StylingRulesEditor onBack={() => setDialogStep("main")} />
        ) : dialogStep === "rules" ? (
          <ActionRulesEditor
            onBack={() => setDialogStep("main")}
            pages={(layout?.pages ?? []).map((p) => ({
              id: p.id,
              title: p.title,
            }))}
          />
        ) : null}
        {dialogStep === "templates" && (
          <TemplateBrowser
            templates={templates}
            loading={templatesLoading}
            connectorType={selectedConnectorType ?? null}
            onApply={applyTemplate}
            onBack={() => setDialogStep("main")}
          />
        )}
        {dialogStep === "main" && (
          <>
            <DialogHeader>
              <DialogTitle>
                {(() => {
                  switch (mode) {
                    case "lab-edit":
                      return "Edit Template";
                    case "lab-create":
                      return "Create Template";
                    case "edit":
                      return "Edit Widget";
                    default:
                      return "Add Widget";
                  }
                })()}
              </DialogTitle>
            </DialogHeader>

            <div
              className="py-4 min-h-[520px] flex-1 overflow-y-auto"
              style={{
                display: "grid",
                gridTemplateColumns: "minmax(0, 1fr) minmax(0, 1fr)",
                gap: "1.5rem",
              }}
            >
              {/* Left column: tabs + settings */}
              <div className="overflow-y-auto max-h-[calc(90vh-180px)] pr-2">
                {/* Lab mode: template metadata */}
                {isLabMode && <LabMetadataForm />}

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
                  resetKey={chartType}
                  dataTab={
                    <div className="space-y-4">
                      <ChartTypeSelector
                        connectionId={connectionId}
                        onConnectionChange={handleConnectionChange}
                        chartType={chartType}
                        onChartTypeChange={handleChartTypeChange}
                        compatibleChartTypes={compatibleChartTypes}
                        connections={connections}
                        showConnection={
                          !isContentOnly &&
                          (isForm || !isParamSelect || paramUIType === "select")
                        }
                      />

                      {mode === "add" && !isLabMode && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="w-full justify-start gap-2 text-muted-foreground hover:text-foreground"
                          onClick={() => setDialogStep("templates")}
                        >
                          <FlaskConical className="h-4 w-4" />
                          From Template
                        </Button>
                      )}

                      {/* Connector-changed warning */}
                      {!isParamSelect && !isContentOnly && connectorChanged && (
                        <Alert variant="default" className="py-2">
                          <AlertTriangle className="h-4 w-4" />
                          <AlertTitle className="text-sm">
                            Connector changed
                          </AlertTitle>
                          <AlertDescription className="text-xs">
                            Switching connectors may make the existing query
                            invalid. Review the query before saving.
                          </AlertDescription>
                        </Alert>
                      )}

                      {/* Parameter config (when parameter-select) */}
                      {isParamSelect && (
                        <ParameterConfigSection
                          seedQueryExecution={seedQueryExecution}
                          seedPreviewOptions={seedPreviewOptions}
                        />
                      )}

                      {/* Collision warning for param-select */}
                      {isParamSelect && paramSelectCollisions.length > 0 && (
                        <Alert
                          variant="default"
                          className="py-2"
                          data-testid="param-collision-banner"
                        >
                          <Info className="h-4 w-4" />
                          <AlertTitle className="text-sm">
                            Parameter name already in use
                          </AlertTitle>
                          <AlertDescription className="text-xs">
                            {paramSelectCollisions.length === 1
                              ? `"${paramWidgetName}" is also set by: ${paramSelectCollisions[0].title}.`
                              : `"${paramWidgetName}" is also set by: ${paramSelectCollisions.map((c) => c.title).join(", ")}.`}{" "}
                            Multiple widgets writing to the same parameter may
                            conflict.
                          </AlertDescription>
                        </Alert>
                      )}

                      {/* Query editor (non-parameter and non-content types) */}
                      {!isParamSelect && !isContentOnly && (
                        <QueryEditorPanel
                          onRun={isForm ? undefined : handlePreview}
                          editorLanguage={editorLanguage}
                          running={previewQuery.isPending}
                        />
                      )}

                      {/* Per-card database selector */}
                      {!isParamSelect &&
                        !isContentOnly &&
                        selectedConnection?.allowPerCardDb &&
                        connectionId && (
                          <DatabaseSelector
                            connectionId={connectionId}
                            database={database}
                            onDatabaseChange={setDatabase}
                          />
                        )}

                      {/* Form fields editor (form type only) */}
                      {isForm && <FormFieldsEditor />}
                    </div>
                  }
                  styleTab={
                    <div className="space-y-4">
                      <ChartOptionsPanel
                        chartType={chartType}
                        settings={chartOptions}
                        onSettingsChange={setChartOptions}
                        columns={availableFields}
                      />
                      {chartType === "table" && (
                        <div className="space-y-3 border-t pt-4">
                          <h4 className="text-xs font-medium uppercase text-muted-foreground tracking-wider">
                            Color Scales
                          </h4>
                          {availableFields.length === 0 ? (
                            <p className="text-xs text-muted-foreground italic">
                              Run a preview query to configure color scales.
                            </p>
                          ) : (
                            <ColorScalePanel
                              columns={availableFields}
                              colorScales={colorScales}
                              onColorScalesChange={setColorScales}
                            />
                          )}
                        </div>
                      )}
                      {chartOptions.cacheMode === "forever" && (
                        <div
                          className="flex items-center gap-2 rounded-lg border px-3 py-2 text-xs text-muted-foreground"
                          data-testid="cache-forever-info"
                        >
                          <Info className="h-4 w-4 shrink-0" />
                          <span>
                            Data will be fetched once and cached until manually
                            refreshed.
                          </span>
                        </div>
                      )}
                    </div>
                  }
                  transformTab={
                    !isContentOnly && !isParamSelect ? (
                      <div className="space-y-4">
                        <TransformEditor
                          transforms={transforms}
                          onChange={setTransforms}
                          columns={availableFields}
                          sampleRow={sampleRow}
                          parameterSuggestions={parameterSuggestions}
                          enabled={transformsEnabled}
                          onEnabledChange={setTransformsEnabled}
                        />
                      </div>
                    ) : undefined
                  }
                  advancedTab={
                    isParamSelect ? (
                      <p className="text-sm text-muted-foreground">
                        No advanced options for parameter widgets.
                      </p>
                    ) : isForm ? (
                      <AdvancedFormRefreshSection
                        otherWidgets={otherWidgets ?? []}
                      />
                    ) : (
                      <div className="space-y-4">
                        {/* Write mode — only for users with canWrite, not content-only widgets */}
                        {canWrite && !isLabMode && !isContentOnly && (
                          <div className="space-y-4">
                            <h4 className="text-xs font-medium uppercase text-muted-foreground tracking-wider">
                              Write Mode
                            </h4>
                            <div className="flex items-center gap-2">
                              <Checkbox
                                id="allow-writes"
                                checked={allowWrites}
                                onCheckedChange={(checked) =>
                                  setAllowWrites(!!checked)
                                }
                              />
                              <Label htmlFor="allow-writes" className="text-sm">
                                Enable write mode
                              </Label>
                            </div>
                            {allowWrites && (
                              <p className="text-xs text-muted-foreground pl-6">
                                This widget can execute write queries. The
                                server still requires your account to have write
                                permission.
                              </p>
                            )}
                          </div>
                        )}

                        <AdvancedCachingSection />
                        {chartSupportsClickAction(chartType) && (
                          <AdvancedInteractivitySection
                            clickActionCollisions={clickActionCollisions}
                          />
                        )}
                        {chartSupportsStyling(chartType) && (
                          <AdvancedStylingSection />
                        )}
                      </div>
                    )
                  }
                />
              </div>

              {/* Right column: preview */}
              <WidgetPreviewPanel
                chartType={chartType}
                connectionId={connectionId}
                query={query}
                title={title}
                chartOptions={chartOptions}
                colorScales={colorScales}
                transforms={transforms}
                transformsEnabled={transformsEnabled}
                buildStylingConfig={buildStylingConfig}
                isParamSelect={isParamSelect}
                isForm={isForm}
                isContentOnly={isContentOnly}
                isMarkdown={isMarkdown}
                isIframe={isIframe}
                paramUIType={paramUIType}
                dateSub={dateSub}
                multiSelect={multiSelect}
                paramWidgetName={paramWidgetName}
                seedPreviewOptions={seedPreviewOptions}
                seedQueryPending={seedQueryExecution.isPending}
                seedQueryError={
                  seedQueryExecution.isError
                    ? seedQueryExecution.error.message
                    : null
                }
                formFields={formFields}
                previewRef={previewRef}
                previewQuery={{
                  isPending: previewQuery.isPending,
                  isError: previewQuery.isError,
                  error: previewQuery.error,
                  data: previewQuery.data,
                }}
                initialPreviewData={initialPreviewData}
                onRunPreview={handlePreview}
              />
            </div>

            <ModalFooter
              mode={mode}
              labError={labError}
              labSaving={labSaving}
              saveStatus={saveStatus}
              isContentOnly={isContentOnly}
              onCancel={() => onOpenChange(false)}
              onSave={handleSave}
              onLabSave={handleLabSave}
            />
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
