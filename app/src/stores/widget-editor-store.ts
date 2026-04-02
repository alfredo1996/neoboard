import { create } from "zustand";
import type {
  DashboardWidget,
  DashboardLayoutV2,
  ClickAction,
  ClickActionRule,
  StylingRule,
  StylingConfig,
} from "@/lib/db/schema";
import type { ColorScaleConfig } from "@neoboard/components/charts";
import type { FormFieldDef } from "@/lib/form-field-def";
import {
  chartSupportsClickAction,
  chartSupportsStyling,
  getChartDefaults,
} from "@/lib/chart-registry";
import { migrateColorThresholds } from "@/lib/migrate-color-thresholds";
import type { Transform } from "@/lib/data-transforms";

// ParamUIType/DateSubType are string unions — define locally to avoid importing
// the React component file (which pulls in @neoboard/components UI barrel).
export type ParamUIType = "date" | "freetext" | "select";
export type DateSubType = "single" | "range" | "relative";

/** Reverse-map an internal parameterType to UI state. Duplicated from parameter-config-section to avoid UI import. */
function reverseParamTypeMapping(internalType: string): {
  uiType: ParamUIType;
  dateSub: DateSubType;
  multi: boolean;
} {
  switch (internalType) {
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

// ---------------------------------------------------------------------------
// State interface
// ---------------------------------------------------------------------------

export interface WidgetEditorState {
  // ── Widget identity ─────────────────────────────────────────────
  chartType: string;
  connectionId: string;
  query: string;
  title: string;
  templateId?: string;
  templateSyncedAt?: string;

  // ── Chart options ───────────────────────────────────────────────
  chartOptions: Record<string, unknown>;
  enableCache: boolean;
  cacheTtlMinutes: number;

  // ── Click actions ───────────────────────────────────────────────
  clickActionEnabled: boolean;
  clickActionType: ClickAction["type"];
  parameterName: string;
  sourceField: string;
  targetPageId: string;
  clickableColumns: string[];
  actionRules: ClickActionRule[];

  // ── Styling ─────────────────────────────────────────────────────
  stylingEnabled: boolean;
  stylingRules: StylingRule[];
  colorScales: ColorScaleConfig[];

  // ── Parameter widget ────────────────────────────────────────────
  paramUIType: ParamUIType;
  dateSub: DateSubType;
  multiSelect: boolean;
  paramWidgetName: string;

  // ── Form widget ─────────────────────────────────────────────────
  formFields: FormFieldDef[];
  refreshWidgetIds: string[];

  // ── Data transforms ───────────────────────────────────────────
  transforms: Transform[];
  transformsEnabled: boolean;

  // ── Lab mode ────────────────────────────────────────────────────
  labName: string;
  labDescription: string;
  labTagsInput: string;

  // ── Derived / external data ──────────────────────────────────────
  availableFields: string[];
  parameterSuggestions: string[];

  // ── UI state ────────────────────────────────────────────────────
  dialogStep: "main" | "rules" | "styling-rules" | "templates";
  connectorChanged: boolean;

  // ── Actions ─────────────────────────────────────────────────────
  setChartType: (t: string) => void;
  setConnectionId: (id: string) => void;
  setQuery: (q: string) => void;
  setTitle: (t: string) => void;
  setChartOptions: (
    opts:
      | Record<string, unknown>
      | ((prev: Record<string, unknown>) => Record<string, unknown>),
  ) => void;
  setEnableCache: (v: boolean) => void;
  setCacheTtlMinutes: (v: number) => void;

  setClickActionEnabled: (v: boolean) => void;
  setClickActionType: (v: ClickAction["type"]) => void;
  setParameterName: (v: string) => void;
  setSourceField: (v: string) => void;
  setTargetPageId: (v: string) => void;
  setClickableColumns: (v: string[]) => void;
  setActionRules: (v: ClickActionRule[]) => void;

  setStylingEnabled: (v: boolean) => void;
  setStylingRules: (v: StylingRule[]) => void;
  setColorScales: (v: ColorScaleConfig[]) => void;

  setParamUIType: (v: ParamUIType) => void;
  setDateSub: (v: DateSubType) => void;
  setMultiSelect: (v: boolean) => void;
  setParamWidgetName: (v: string) => void;

  setFormFields: (v: FormFieldDef[]) => void;
  setRefreshWidgetIds: (v: string[]) => void;
  setTransforms: (v: Transform[]) => void;
  setTransformsEnabled: (v: boolean) => void;

  setLabName: (v: string) => void;
  setLabDescription: (v: string) => void;
  setLabTagsInput: (v: string) => void;

  setAvailableFields: (v: string[]) => void;
  setParameterSuggestions: (v: string[]) => void;
  setDialogStep: (v: "main" | "rules" | "styling-rules" | "templates") => void;
  setConnectorChanged: (v: boolean) => void;

  // ── Bulk operations ─────────────────────────────────────────────
  resetForAdd: () => void;
  clearQueryState: () => void;
  loadFromWidget: (widget: DashboardWidget) => void;

  // ── Build helpers ───────────────────────────────────────────────
  buildStylingConfig: () => StylingConfig | undefined;
  buildClickAction: (layout?: DashboardLayoutV2) => ClickAction | undefined;
}

// ---------------------------------------------------------------------------
// Helpers (extracted to reduce buildClickAction cognitive complexity)
// ---------------------------------------------------------------------------

function validateActionRules(
  rules: ClickActionRule[],
  validPageIds: Set<string>,
): boolean {
  for (const rule of rules) {
    const needsParam =
      rule.type === "set-parameter" ||
      rule.type === "set-parameter-and-navigate";
    if (needsParam && !rule.parameterMapping?.parameterName?.trim())
      return false;
    const needsPage =
      rule.type === "navigate-to-page" ||
      rule.type === "set-parameter-and-navigate";
    if (
      needsPage &&
      (!rule.targetPageId || !validPageIds.has(rule.targetPageId))
    )
      return false;
  }
  return true;
}

function buildLegacyClickAction(
  s: Pick<
    WidgetEditorState,
    "clickActionType" | "parameterName" | "sourceField" | "targetPageId"
  >,
  validPageIds: Set<string>,
  clickableColumns?: string[],
): ClickAction | undefined {
  const action: ClickAction = { type: s.clickActionType };
  if (
    s.clickActionType === "set-parameter" ||
    s.clickActionType === "set-parameter-and-navigate"
  ) {
    if (!s.parameterName.trim()) return undefined;
    action.parameterMapping = {
      parameterName: s.parameterName,
      sourceField: s.sourceField || s.parameterName,
    };
  }
  if (
    s.clickActionType === "navigate-to-page" ||
    s.clickActionType === "set-parameter-and-navigate"
  ) {
    if (!s.targetPageId || !validPageIds.has(s.targetPageId)) return undefined;
    action.targetPageId = s.targetPageId;
  }
  if (clickableColumns?.length) action.clickableColumns = clickableColumns;
  return action;
}

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

function getInitialState() {
  return {
    chartType: "bar",
    connectionId: "",
    query: "",
    title: "",
    templateId: undefined as string | undefined,
    templateSyncedAt: undefined as string | undefined,
    chartOptions: getChartDefaults("bar"),
    enableCache: true,
    cacheTtlMinutes: 5,
    clickActionEnabled: false,
    clickActionType: "set-parameter" as ClickAction["type"],
    parameterName: "",
    sourceField: "",
    targetPageId: "",
    clickableColumns: [] as string[],
    actionRules: [] as ClickActionRule[],
    stylingEnabled: false,
    stylingRules: [] as StylingRule[],
    colorScales: [] as ColorScaleConfig[],
    paramUIType: "select" as ParamUIType,
    dateSub: "single" as DateSubType,
    multiSelect: false,
    paramWidgetName: "",
    formFields: [] as FormFieldDef[],
    refreshWidgetIds: [] as string[],
    transforms: [] as Transform[],
    transformsEnabled: true,
    labName: "",
    labDescription: "",
    labTagsInput: "",
    availableFields: [] as string[],
    parameterSuggestions: [] as string[],
    dialogStep: "main" as const,
    connectorChanged: false,
  };
}

export const useWidgetEditorStore = create<WidgetEditorState>((set, get) => ({
  ...getInitialState(),

  // ── Simple setters ──────────────────────────────────────────────
  setChartType: (t) => {
    set({ chartType: t, chartOptions: getChartDefaults(t) });
    if (!chartSupportsClickAction(t)) set({ clickActionEnabled: false });
    if (!chartSupportsStyling(t)) set({ stylingEnabled: false });
  },
  setConnectionId: (id) => set({ connectionId: id }),
  setQuery: (q) => set({ query: q }),
  setTitle: (t) => set({ title: t }),
  setChartOptions: (opts) =>
    set((s) => ({
      chartOptions: typeof opts === "function" ? opts(s.chartOptions) : opts,
    })),
  setEnableCache: (v) => set({ enableCache: v }),
  setCacheTtlMinutes: (v) => set({ cacheTtlMinutes: v }),

  setClickActionEnabled: (v) => set({ clickActionEnabled: v }),
  setClickActionType: (v) => set({ clickActionType: v }),
  setParameterName: (v) => set({ parameterName: v }),
  setSourceField: (v) => set({ sourceField: v }),
  setTargetPageId: (v) => set({ targetPageId: v }),
  setClickableColumns: (v) => set({ clickableColumns: v }),
  setActionRules: (v) => set({ actionRules: v }),

  setStylingEnabled: (v) => set({ stylingEnabled: v }),
  setStylingRules: (v) => set({ stylingRules: v }),
  setColorScales: (v) => set({ colorScales: v }),

  setParamUIType: (v) => set({ paramUIType: v }),
  setDateSub: (v) => set({ dateSub: v }),
  setMultiSelect: (v) => set({ multiSelect: v }),
  setParamWidgetName: (v) => set({ paramWidgetName: v }),

  setFormFields: (v) => set({ formFields: v }),
  setRefreshWidgetIds: (v) => set({ refreshWidgetIds: v }),
  setTransforms: (v) => set({ transforms: v }),
  setTransformsEnabled: (v) => set({ transformsEnabled: v }),

  setLabName: (v) => set({ labName: v }),
  setLabDescription: (v) => set({ labDescription: v }),
  setLabTagsInput: (v) => set({ labTagsInput: v }),

  setAvailableFields: (v) => set({ availableFields: v }),
  setParameterSuggestions: (v) => set({ parameterSuggestions: v }),
  setDialogStep: (v) => set({ dialogStep: v }),
  setConnectorChanged: (v) => set({ connectorChanged: v }),

  // ── Bulk operations ─────────────────────────────────────────────
  resetForAdd: () => set(getInitialState()),
  clearQueryState: () =>
    set({ query: "", availableFields: [], transforms: [] }),

  loadFromWidget: (widget) => {
    const s = widget.settings ?? {};
    const opts = (s.chartOptions as Record<string, unknown>) ?? {};
    const ca = s.clickAction as ClickAction | undefined;
    const caMapping = ca?.parameterMapping;
    const sc = s.stylingConfig as StylingConfig | undefined;
    const cf = s.conditionalFormatting as
      | { colorScales?: ColorScaleConfig[] }
      | undefined;

    // Resolve styling (new format or migrated from legacy)
    let stylingEnabled = false;
    let stylingRules: StylingRule[] = [];
    if (sc) {
      stylingEnabled = sc.enabled;
      stylingRules = sc.rules ?? [];
    } else {
      const legacyThresholds = opts.colorThresholds;
      if (typeof legacyThresholds === "string" && legacyThresholds.trim()) {
        const migrated = migrateColorThresholds(legacyThresholds);
        stylingEnabled = !!migrated?.enabled;
        stylingRules = migrated?.rules ?? [];
      }
    }

    // Resolve parameter widget state
    let paramUIType: ParamUIType = "select";
    let dateSub: DateSubType = "single";
    let multiSelect = false;
    let paramWidgetName = "";
    if (widget.chartType === "parameter-select") {
      const paramOpts = s.chartOptions as Record<string, unknown> | undefined;
      const internalType = (paramOpts?.parameterType as string) ?? "select";
      const mapped = reverseParamTypeMapping(internalType);
      paramUIType = mapped.uiType;
      dateSub = mapped.dateSub;
      multiSelect = mapped.multi;
      paramWidgetName = (paramOpts?.parameterName as string) ?? "";
    }

    set({
      chartType: widget.chartType,
      connectionId: widget.connectionId,
      query: widget.query,
      title: (s.title as string) ?? "",
      templateId: widget.templateId,
      templateSyncedAt: widget.templateSyncedAt,
      chartOptions:
        Object.keys(opts).length > 0
          ? opts
          : getChartDefaults(widget.chartType),
      enableCache: s.enableCache !== false,
      cacheTtlMinutes: (s.cacheTtlMinutes as number | undefined) ?? 5,
      clickActionEnabled: !!ca,
      clickActionType: ca?.type ?? "set-parameter",
      parameterName: caMapping?.parameterName ?? "",
      sourceField: caMapping?.sourceField ?? "",
      targetPageId: ca?.targetPageId ?? "",
      clickableColumns: ca?.clickableColumns ?? [],
      actionRules: ca?.rules ?? [],
      stylingEnabled,
      stylingRules,
      colorScales: cf?.colorScales ?? [],
      paramUIType,
      dateSub,
      multiSelect,
      paramWidgetName,
      formFields: (s.formFields as FormFieldDef[] | undefined) ?? [],
      refreshWidgetIds: (opts.refreshWidgetIds as string[] | undefined) ?? [],
      transforms: (s.transforms as Transform[] | undefined) ?? [],
      transformsEnabled: s.transformsEnabled !== false,
      dialogStep: "main",
      connectorChanged: false,
    });
  },

  // ── Build helpers ───────────────────────────────────────────────
  buildStylingConfig: () => {
    const { stylingEnabled, chartType, stylingRules } = get();
    if (!stylingEnabled || !chartSupportsStyling(chartType)) return undefined;
    return { enabled: true, rules: stylingRules };
  },

  buildClickAction: (layout) => {
    const s = get();
    if (!s.clickActionEnabled || !chartSupportsClickAction(s.chartType))
      return undefined;

    const pageIds = new Set((layout?.pages ?? []).map((p) => p.id));
    const cols = s.clickableColumns.length > 0 ? s.clickableColumns : undefined;

    // Advanced rules mode
    if (s.actionRules.length > 0) {
      if (!validateActionRules(s.actionRules, pageIds)) return undefined;
      return {
        type: s.actionRules[0].type,
        rules: s.actionRules,
        clickableColumns: cols,
      };
    }

    // Legacy single-rule mode
    return buildLegacyClickAction(s, pageIds, cols);
  },
}));
