"use client";

import React, { useState, useCallback, useEffect, useMemo, useRef } from "react";
import { CardContainer } from "./card-container";
import { useQueryExecution } from "@/hooks/use-query-execution";
import type { DashboardWidget, DashboardLayoutV2, ClickAction, ClickActionRule, WidgetTemplate, StylingRule, StylingConfig } from "@/lib/db/schema";
import type { ConnectionListItem } from "@/hooks/use-connections";
import { collectParameterNames, findParameterCollisions } from "@/lib/collect-parameter-names";
import { AlertCircle, AlertTriangle, Info, Play, FlaskConical } from "lucide-react";
import { useWidgetTemplates, useCreateWidgetTemplate, useUpdateWidgetTemplate } from "@/hooks/use-widget-templates";

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
  Checkbox,
  CodePreview,
} from "@neoboard/components";
import {
  getCompatibleChartTypes,
  getChartConfig,
  chartRegistry,
  chartSupportsClickAction,
  chartSupportsStyling,
  getStylingTargets,
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
import { ActionRulesEditor } from "./widget-editor/action-rules-editor";
import { StylingRulesEditor } from "./widget-editor/styling-rules-editor";
import { migrateColorThresholds } from "@/lib/migrate-color-thresholds";

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
}: WidgetEditorModalProps) {
  const isLabMode = mode === "lab-edit" || mode === "lab-create";
  const [chartType, setChartType] = useState(widget?.chartType ?? "bar");
  const [connectionId, setConnectionId] = useState(widget?.connectionId ?? "");
  const [query, setQuery] = useState(widget?.query ?? "");
  const [title, setTitle] = useState(
    (widget?.settings?.title as string) ?? ""
  );
  const [templateId, setTemplateId] = useState<string | undefined>(widget?.templateId);
  const [templateSyncedAt, setTemplateSyncedAt] = useState<string | undefined>(widget?.templateSyncedAt);
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
  const [clickableColumns, setClickableColumns] = useState<string[]>(
    existingClickAction?.clickableColumns ?? []
  );
  const [actionRules, setActionRules] = useState<ClickActionRule[]>(
    existingClickAction?.rules ?? []
  );

  // Styling rules state
  const existingStylingConfig = widget?.settings?.stylingConfig as StylingConfig | undefined;
  const [stylingEnabled, setStylingEnabled] = useState(!!existingStylingConfig?.enabled);
  const [stylingRules, setStylingRules] = useState<StylingRule[]>(
    existingStylingConfig?.rules ?? []
  );
  const [stylingTargetColumn, setStylingTargetColumn] = useState(
    existingStylingConfig?.targetColumn ?? ""
  );

  const [dialogStep, setDialogStep] = useState<"main" | "rules" | "styling-rules" | "templates">("main");
  const [templateSearch, setTemplateSearch] = useState("");

  // Lab-mode metadata state
  const [labName, setLabName] = useState(templateProp?.name ?? "");
  const [labDescription, setLabDescription] = useState(templateProp?.description ?? "");
  const [labTagsInput, setLabTagsInput] = useState((templateProp?.tags ?? []).join(", "));

  // Lab-mode mutations
  const createTemplate = useCreateWidgetTemplate();
  const updateTemplate = useUpdateWidgetTemplate();
  const previewRef = useRef<HTMLDivElement>(null);

  // Parameter name suggestions from the dashboard layout
  const parameterSuggestions = useMemo(
    () => (layout ? collectParameterNames(layout) : []),
    [layout]
  );

  // Derive other widgets from layout for the "After Submit" refresh config.
  // Includes all widgets across all pages except the widget being edited.
  const otherWidgets = useMemo(() => {
    if (!layout) return [];
    return layout.pages
      .flatMap((p) => p.widgets)
      .filter((w) => w.id !== widget?.id)
      .map((w) => ({ id: w.id, title: (w.settings?.title as string) ?? "", chartType: w.chartType }));
  }, [layout, widget?.id]);

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

  // Widgets that already set the same parameter name (collision warning).
  // Use widget?.id ?? "" so new widgets (no id yet) still get collision checks.
  const paramSelectCollisions = useMemo(
    () =>
      layout
        ? findParameterCollisions(layout, widget?.id ?? "", paramWidgetName)
        : [],
    [layout, widget?.id, paramWidgetName]
  );

  const clickActionCollisions = useMemo(() => {
    if (!layout || !clickActionEnabled) return [];
    const names: string[] = [];
    if (parameterName.trim()) names.push(parameterName.trim());
    for (const rule of actionRules) {
      if (rule.parameterMapping?.parameterName) names.push(rule.parameterMapping.parameterName);
    }
    const seen = new Set<string>();
    const all: ReturnType<typeof findParameterCollisions> = [];
    for (const name of names) {
      if (seen.has(name)) continue;
      seen.add(name);
      for (const c of findParameterCollisions(layout, widget?.id ?? "", name)) {
        if (!all.some((x) => x.widgetId === c.widgetId)) all.push(c);
      }
    }
    return all;
  }, [layout, widget?.id, clickActionEnabled, parameterName, actionRules]);

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

  // Template picker — only used in add mode
  const selectedConnectorType = selectedConnection?.type ?? undefined;
  const { data: templates, isLoading: templatesLoading } = useWidgetTemplates(
    mode === "add" && dialogStep === "templates"
      ? { connectorType: selectedConnectorType }
      : undefined
  );

  // Guard against the add-mode chartType reset effect overwriting template settings
  const applyingTemplateRef = useRef(false);

  function applyTemplate(t: WidgetTemplate) {
    applyingTemplateRef.current = true;
    setTemplateId(t.id);
    // API returns dates as ISO strings (JSON serialization), not Date objects
    setTemplateSyncedAt(
      t.updatedAt ? String(t.updatedAt) : new Date().toISOString()
    );
    setChartType(t.chartType);
    setQuery(t.query ?? "");
    setTitle((t.settings?.title as string) ?? "");
    setChartOptions(
      (t.settings?.chartOptions as Record<string, unknown>) ?? getDefaultChartSettings(t.chartType)
    );

    // Auto-populate connector if none selected yet
    if (!connectionId) {
      if (t.connectionId && connections.some((c) => c.id === t.connectionId)) {
        // Prefer the template's bound connection if it exists
        setConnectionId(t.connectionId);
      } else if (t.connectorType) {
        // Fall back to first connection of matching type
        const match = connections.find((c) => c.type === t.connectorType);
        if (match) setConnectionId(match.id);
      }
    }

    setTemplateSearch("");
    setDialogStep("main");
  }
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
      // Auto-disable click action when switching to an unsupported type
      if (!chartSupportsClickAction(t)) {
        setClickActionEnabled(false);
      }
      // Auto-disable styling when switching to an unsupported type
      if (!chartSupportsStyling(t)) {
        setStylingEnabled(false);
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
        setClickableColumns([]);
        setEnableCache(true);
        setCacheTtlMinutes(5);
        setConnectorChanged(false);
        setParamUIType("select");
        setDateSub("single");
        setMultiSelect(false);
        setParamWidgetName("");
        setFormFields([]);
        setRefreshWidgetIds([]);
        setActionRules([]);
        setStylingEnabled(false);
        setStylingRules([]);
        setStylingTargetColumn("");
        setDialogStep("main");
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
        setClickableColumns(ca?.clickableColumns ?? []);
        setActionRules(ca?.rules ?? []);

        // Initialize styling rules from existing widget
        const sc = widget.settings?.stylingConfig as StylingConfig | undefined;
        if (sc) {
          setStylingEnabled(sc.enabled);
          setStylingRules(sc.rules ?? []);
          setStylingTargetColumn(sc.targetColumn ?? "");
        } else {
          // Try migrating from legacy colorThresholds
          const legacyThresholds = (widget.settings?.chartOptions as Record<string, unknown> | undefined)?.colorThresholds;
          const legacyColumn = (widget.settings?.chartOptions as Record<string, unknown> | undefined)?.colorThresholdsColumn;
          if (typeof legacyThresholds === "string" && legacyThresholds.trim()) {
            const migrated = migrateColorThresholds(
              legacyThresholds,
              typeof legacyColumn === "string" ? legacyColumn : undefined,
            );
            if (migrated) {
              setStylingEnabled(migrated.enabled);
              setStylingRules(migrated.rules);
              setStylingTargetColumn(migrated.targetColumn ?? "");
            } else {
              setStylingEnabled(false);
              setStylingRules([]);
              setStylingTargetColumn("");
            }
          } else {
            setStylingEnabled(false);
            setStylingRules([]);
            setStylingTargetColumn("");
          }
        }

        setDialogStep("main");
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
      } else if (mode === "lab-create") {
        // Fresh lab-create: same as add but with metadata fields
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
        setClickableColumns([]);
        setEnableCache(true);
        setCacheTtlMinutes(5);
        setConnectorChanged(false);
        setFormFields([]);
        setActionRules([]);
        setStylingEnabled(false);
        setStylingRules([]);
        setStylingTargetColumn("");
        setLabName("");
        setLabDescription("");
        setLabTagsInput("");
        setDialogStep("main");
        seedQueryExecution.reset();
        previewQuery.reset();
      } else if (mode === "lab-edit" && templateProp) {
        // Initialize from template
        setChartType(templateProp.chartType);
        setConnectionId(templateProp.connectionId ?? "");
        setQuery(templateProp.query ?? "");
        setTitle((templateProp.settings?.title as string) ?? "");
        setChartOptions(
          (templateProp.settings?.chartOptions as Record<string, unknown>) ??
            getDefaultChartSettings(templateProp.chartType)
        );
        setLabName(templateProp.name);
        setLabDescription(templateProp.description ?? "");
        setLabTagsInput((templateProp.tags ?? []).join(", "));
        setClickActionEnabled(false);
        setStylingEnabled(false);
        setStylingRules([]);
        setStylingTargetColumn("");
        setActionRules([]);
        setDialogStep("main");
        seedQueryExecution.reset();
        previewQuery.reset();
      }
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
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, mode, initialTemplate]);

  // Re-initialize chart options when chart type changes (add/lab-create mode only).
  // Skip reset when the change comes from applyTemplate to preserve template settings.
  useEffect(() => {
    if (mode === "add" || mode === "lab-create") {
      if (applyingTemplateRef.current) {
        applyingTemplateRef.current = false;
        return;
      }
      setChartOptions(getDefaultChartSettings(chartType));
    }
  }, [chartType, mode]);

  // Build click action from current editor state
  const buildClickAction = useCallback((): ClickAction | undefined => {
    if (!clickActionEnabled || !chartSupportsClickAction(chartType)) return undefined;
    const needsParam = clickActionType === "set-parameter" || clickActionType === "set-parameter-and-navigate";
    const needsPage = clickActionType === "navigate-to-page" || clickActionType === "set-parameter-and-navigate";
    const trimmedParamName = parameterName.trim();
    const trimmedSourceField = sourceField.trim();
    const trimmedTargetPageId = targetPageId.trim();
    if (needsParam && !trimmedParamName) return undefined;
    // For tables, sourceField is empty (cell-click provides the value directly)
    const resolvedSourceField = chartType === "table" ? "" : trimmedSourceField;
    if (needsParam && chartType !== "table" && !resolvedSourceField) return undefined;
    if (needsPage && !trimmedTargetPageId) return undefined;
    // Validate targetPageId against current layout pages to prevent stale references
    if (needsPage && layout) {
      const validPageIds = new Set((layout.pages ?? []).map((p) => p.id));
      if (!validPageIds.has(trimmedTargetPageId)) return undefined;
    }
    return {
      type: actionRules.length > 0 ? actionRules[0].type : clickActionType,
      ...(needsParam && actionRules.length === 0 ? { parameterMapping: { parameterName: trimmedParamName, sourceField: resolvedSourceField } } : {}),
      ...(needsPage && actionRules.length === 0 ? { targetPageId: trimmedTargetPageId } : {}),
      ...(chartType === "table" && clickableColumns.length > 0 && actionRules.length === 0 ? { clickableColumns } : {}),
      ...(actionRules.length > 0 ? { rules: actionRules } : {}),
    };
  }, [clickActionEnabled, clickActionType, parameterName, sourceField, chartType, targetPageId, layout, clickableColumns, actionRules]);

  const buildStylingConfig = useCallback((): StylingConfig | undefined => {
    if (!stylingEnabled || !chartSupportsStyling(chartType)) return undefined;
    if (stylingRules.length === 0) return undefined;
    return {
      enabled: true,
      rules: stylingRules,
      targetColumn: stylingTargetColumn || undefined,
    };
  }, [stylingEnabled, chartType, stylingRules, stylingTargetColumn]);

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
              formFields: chartType === "form" ? formFields : undefined,
              clickAction: buildClickAction(),
              stylingConfig: buildStylingConfig(),
              enableCache,
              cacheTtlMinutes,
            },
            templateId,
            templateSyncedAt,
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
    buildStylingConfig,
    chartType,
    title,
    chartOptions,
    formFields,
    enableCache,
    cacheTtlMinutes,
    previewQuery,
    onSave,
    onOpenChange,
    templateId,
    templateSyncedAt,
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
    const clickAction = buildClickAction();
    const stylingConfig = buildStylingConfig();
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
        stylingConfig: (isParamSelect || isForm) ? undefined : stylingConfig,
        enableCache: (isParamSelect || isForm) ? undefined : enableCache,
        cacheTtlMinutes: (isParamSelect || isForm) ? undefined : cacheTtlMinutes,
      },
      templateId,
      templateSyncedAt,
    });
    onOpenChange(false);
  }

  const [labError, setLabError] = useState<string | null>(null);

  async function handleLabSave() {
    if (!labName.trim()) return;
    setLabError(null);

    const selectedConn = connections.find((c) => c.id === connectionId);
    const connectorType: "neo4j" | "postgresql" = selectedConn?.type ?? "neo4j";

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
      connectionId: connectionId || undefined,
      query,
      settings: {
        title: title || undefined,
        chartOptions,
        stylingConfig: buildStylingConfig(),
        clickAction: buildClickAction(),
      },
    };

    try {
      if (mode === "lab-edit" && templateProp) {
        await updateTemplate.mutateAsync({ id: templateProp.id, ...templateData });
      } else {
        await createTemplate.mutateAsync(templateData);
      }
      onLabSaved?.();
      onOpenChange(false);
    } catch (err) {
      setLabError(err instanceof Error ? err.message : "Failed to save template");
    }
  }

  const labSaving = createTemplate.isPending || updateTemplate.isPending;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="full" className="max-w-[1200px] max-h-[90vh] flex flex-col overflow-hidden">
        {dialogStep === "styling-rules" ? (
          <StylingRulesEditor
            rules={stylingRules}
            onRulesChange={setStylingRules}
            onBack={() => setDialogStep("main")}
            chartType={chartType}
            targetColumn={stylingTargetColumn}
            onTargetColumnChange={setStylingTargetColumn}
            availableFields={availableFields}
            parameterSuggestions={parameterSuggestions}
            stylingTargets={getStylingTargets(chartType)}
          />
        ) : dialogStep === "rules" ? (
          <ActionRulesEditor
            rules={actionRules}
            onRulesChange={setActionRules}
            onBack={() => setDialogStep("main")}
            chartType={chartType}
            availableFields={availableFields}
            parameterSuggestions={parameterSuggestions}
            pages={(layout?.pages ?? []).map((p) => ({ id: p.id, title: p.title }))}
          />
        ) : null}
        {dialogStep === "templates" && (
          <>
            <DialogHeader>
              <DialogTitle>Browse Templates</DialogTitle>
            </DialogHeader>
            <div className="py-4 flex-1 overflow-y-auto min-h-[400px]">
              {!templatesLoading && templates && templates.length > 0 && (
                <Input
                  placeholder="Search by name..."
                  value={templateSearch}
                  onChange={(e) => setTemplateSearch(e.target.value)}
                  className="mb-3 max-w-xs"
                />
              )}
              {templatesLoading && (
                <div className="flex flex-col items-center justify-center h-48 gap-2 text-muted-foreground">
                  <p className="text-sm">Loading templates...</p>
                </div>
              )}
              {!templatesLoading && (!templates || templates.length === 0) && (
                <div className="flex flex-col items-center justify-center h-48 gap-2 text-muted-foreground">
                  <FlaskConical className="h-8 w-8 opacity-40" />
                  <p className="text-sm">No templates available{selectedConnectorType ? ` for ${selectedConnectorType}` : ""}.</p>
                </div>
              )}
              {!templatesLoading && templates && templates.length > 0 && (() => {
                const filtered = templateSearch
                  ? templates.filter((t) => t.name.toLowerCase().includes(templateSearch.toLowerCase()))
                  : templates;
                return filtered.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-48 gap-2 text-muted-foreground">
                    <p className="text-sm">No templates match &ldquo;{templateSearch}&rdquo;</p>
                  </div>
                ) : (
                  <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-4">
                    {filtered.map((t) => (
                      <button
                        key={t.id}
                        onClick={() => applyTemplate(t)}
                        className="text-left rounded-lg border p-2 hover:bg-accent transition-colors flex flex-col gap-1.5"
                      >
                        <CodePreview
                          value={t.query}
                          language={t.connectorType === "postgresql" ? "SQL" : "Cypher"}
                          maxLines={2}
                        />
                        <span className="font-medium text-xs truncate w-full">{t.name}</span>
                        <div className="flex gap-1 flex-wrap">
                          <Badge variant="secondary" className="text-[10px] px-1.5 py-0">{getChartConfig(t.chartType)?.label ?? t.chartType}</Badge>
                          <Badge variant="outline" className="text-[10px] px-1.5 py-0">{t.connectorType}</Badge>
                        </div>
                      </button>
                    ))}
                  </div>
                );
              })()}
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => { setTemplateSearch(""); setDialogStep("main"); }}>
                Back
              </Button>
            </DialogFooter>
          </>
        )}
        {dialogStep === "main" && (
        <>
        <DialogHeader>
          <DialogTitle>
            {(() => {
              switch (mode) {
                case "lab-edit": return "Edit Template";
                case "lab-create": return "Create Template";
                case "edit": return "Edit Widget";
                default: return "Add Widget";
              }
            })()}
          </DialogTitle>
        </DialogHeader>

        <div className="py-4 min-h-[520px] flex-1 overflow-y-auto" style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) minmax(0, 1fr)", gap: "1.5rem" }}>
          {/* Left column: tabs + settings */}
          <div className="overflow-y-auto max-h-[calc(90vh-180px)] pr-2">
            {/* Lab mode: template metadata */}
            {isLabMode && (
              <div className="space-y-3 mb-4 pb-4 border-b">
                <div className="space-y-1.5">
                  <Label htmlFor="lab-template-name">Template Name <span className="text-destructive">*</span></Label>
                  <Input
                    id="lab-template-name"
                    value={labName}
                    onChange={(e) => setLabName(e.target.value)}
                    placeholder="My chart template"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="lab-template-desc">Description <span className="text-muted-foreground text-xs">(optional)</span></Label>
                  <Input
                    id="lab-template-desc"
                    value={labDescription}
                    onChange={(e) => setLabDescription(e.target.value)}
                    placeholder="What does this template do?"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="lab-template-tags">Tags <span className="text-muted-foreground text-xs">(comma-separated)</span></Label>
                  <Input
                    id="lab-template-tags"
                    value={labTagsInput}
                    onChange={(e) => setLabTagsInput(e.target.value)}
                    placeholder="e.g. neo4j, monitoring, kpi"
                  />
                </div>
              </div>
            )}

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

                  {/* Collision warning for param-select */}
                  {isParamSelect && paramSelectCollisions.length > 0 && (
                    <Alert variant="default" className="py-2" data-testid="param-collision-banner">
                      <Info className="h-4 w-4" />
                      <AlertTitle className="text-sm">Parameter name already in use</AlertTitle>
                      <AlertDescription className="text-xs">
                        {paramSelectCollisions.length === 1
                          ? `"${paramWidgetName}" is also set by: ${paramSelectCollisions[0].title}.`
                          : `"${paramWidgetName}" is also set by: ${paramSelectCollisions.map((c) => c.title).join(", ")}.`}
                        {" "}Multiple widgets writing to the same parameter may conflict.
                      </AlertDescription>
                    </Alert>
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
                <div className="space-y-4">
                  <ChartOptionsPanel
                    chartType={chartType}
                    settings={chartOptions}
                    onSettingsChange={setChartOptions}
                  />
                  {chartOptions.cacheMode === "forever" && (
                    <Alert variant="default" className="py-2" data-testid="cache-forever-info">
                      <Info className="h-4 w-4" />
                      <AlertDescription className="text-xs">
                        Data will be fetched once and cached until manually refreshed.
                      </AlertDescription>
                    </Alert>
                  )}
                </div>
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

                    {/* Interactivity — hidden for chart types that don't support click actions */}
                    {chartSupportsClickAction(chartType) && (
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
                          <p className="text-sm text-muted-foreground">
                            {actionRules.length === 0
                              ? "No action rules configured."
                              : `${actionRules.length} action rule(s) configured.`}
                          </p>
                          <Button variant="outline" size="sm" onClick={() => setDialogStep("rules")}>
                            Manage Action Rules
                          </Button>
                          {clickActionCollisions.length > 0 && (
                            <Alert variant="default" className="py-2" data-testid="click-action-collision-banner">
                              <Info className="h-4 w-4" />
                              <AlertTitle className="text-sm">Parameter name already in use</AlertTitle>
                              <AlertDescription className="text-xs">
                                {clickActionCollisions.length === 1
                                  ? `A parameter set here is also set by: ${clickActionCollisions[0].title}.`
                                  : `Parameters set here are also set by: ${clickActionCollisions.map((c) => c.title).join(", ")}.`}
                                {" "}Multiple widgets writing to the same parameter may conflict.
                              </AlertDescription>
                            </Alert>
                          )}
                        </div>
                      )}
                    </div>
                    )}

                    {/* Rule-based styling — hidden for unsupported chart types */}
                    {chartSupportsStyling(chartType) && (
                    <div className="space-y-4 border-t pt-4">
                      <h4 className="text-xs font-medium uppercase text-muted-foreground tracking-wider">
                        Rule-Based Styling
                      </h4>
                      <div className="flex items-center gap-2">
                        <Checkbox
                          id="styling-enabled"
                          checked={stylingEnabled}
                          onCheckedChange={(checked) => setStylingEnabled(!!checked)}
                        />
                        <Label htmlFor="styling-enabled" className="text-sm">
                          Enable rule-based styling
                        </Label>
                      </div>
                      {stylingEnabled && (
                        <div className="space-y-3 pl-6">
                          <p className="text-sm text-muted-foreground">
                            {stylingRules.length === 0
                              ? "No styling rules configured."
                              : `${stylingRules.length} styling rule(s) configured.`}
                          </p>
                          <Button variant="outline" size="sm" onClick={() => setDialogStep("styling-rules")}>
                            Manage Styling Rules
                          </Button>
                        </div>
                      )}
                    </div>
                    )}
                  </div>
                )
              }
            />
          </div>

          {/* Right column: preview */}
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <Label className="mb-0">Preview</Label>
              {!isParamSelect && !isForm && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handlePreview}
                  disabled={!connectionId || !query.trim() || previewQuery.isPending}
                >
                  {previewQuery.isPending ? (
                    <div className="h-3 w-3 animate-spin rounded-full border-2 border-current border-t-transparent mr-1.5" />
                  ) : (
                    <Play className="h-3 w-3 mr-1.5" />
                  )}
                  Run
                </Button>
              )}
            </div>
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

            <div ref={previewRef} data-testid="widget-preview" className="h-[500px] flex-shrink-0 overflow-hidden border rounded-lg relative">
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
          {labError && (
            <p className="text-sm text-destructive mr-auto">{labError}</p>
          )}
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
          >
            Cancel
          </Button>
          {isLabMode ? (
            <LoadingButton
              type="button"
              disabled={!labName.trim() || !query.trim()}
              loading={labSaving}
              loadingText="Saving..."
              onClick={handleLabSave}
            >
              {mode === "lab-edit" ? "Save Template" : "Create Template"}
            </LoadingButton>
          ) : (
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
          )}
        </DialogFooter>
        </>
        )}
      </DialogContent>
    </Dialog>
  );
}
