import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook } from "@testing-library/react";
import { useBuildWidgetForSave } from "../use-widget-save";
import type { DashboardWidget } from "@/lib/db/schema";

// ── Mock store ─────────────────────────────────────────────────────────────

let mockStoreState: Record<string, unknown> = {};

vi.mock("@/stores/widget-editor-store", () => {
  const store = {
    useWidgetEditorStore: Object.assign(
      (selector: (s: Record<string, unknown>) => unknown) =>
        selector(mockStoreState),
      {
        getState: () => mockStoreState,
      },
    ),
  };
  return store;
});

vi.mock("../parameter-config-section", () => ({
  resolveInternalParamType: vi.fn(
    (ui: string, dateSub: string, multi: boolean) => {
      if (ui === "date") {
        return dateSub === "range"
          ? "date-range"
          : dateSub === "relative"
            ? "date-relative"
            : "date";
      }
      if (ui === "freetext") return "text";
      return multi ? "multi-select" : "select";
    },
  ),
}));

// ── Helpers ────────────────────────────────────────────────────────────────

function setStoreState(overrides: Record<string, unknown> = {}) {
  mockStoreState = {
    chartType: "bar",
    connectionId: "conn-1",
    query: "MATCH (n) RETURN n",
    title: "My Widget",
    chartOptions: {},
    formFields: [],
    transforms: [],
    transformsEnabled: false,
    enableCache: false,
    cacheTtlMinutes: 5,
    colorScales: [],
    refreshWidgetIds: [],
    paramUIType: "select",
    dateSub: "single",
    multiSelect: false,
    paramWidgetName: "",
    templateId: undefined,
    templateSyncedAt: undefined,
    buildClickAction: vi.fn(() => undefined),
    buildStylingConfig: vi.fn(() => undefined),
    addToQueryHistory: vi.fn(),
    queryHistory: [],
    ...overrides,
  };
}

// ── Tests ──────────────────────────────────────────────────────────────────

describe("useBuildWidgetForSave", () => {
  beforeEach(() => {
    setStoreState();
    vi.stubGlobal(
      "crypto",
      Object.assign({}, globalThis.crypto, {
        randomUUID: () => "generated-uuid",
      }),
    );
  });

  // ── Basic payload construction ───────────────────────────────────

  describe("basic widget payload", () => {
    it("builds a new widget with generated ID when no existing widget", () => {
      const { result } = renderHook(() => useBuildWidgetForSave(undefined));
      const widget = result.current();

      expect(widget.id).toBe("generated-uuid");
      expect(widget.chartType).toBe("bar");
      expect(widget.connectionId).toBe("conn-1");
      expect(widget.query).toBe("MATCH (n) RETURN n");
    });

    it("preserves existing widget ID", () => {
      const existing: DashboardWidget = {
        id: "existing-id",
        chartType: "bar",
        connectionId: "conn-1",
        query: "old query",
        params: { foo: "bar" },
        settings: { title: "Old Title" },
      };
      const { result } = renderHook(() => useBuildWidgetForSave(existing));
      const widget = result.current();

      expect(widget.id).toBe("existing-id");
      expect(widget.params).toEqual({ foo: "bar" });
    });

    it("sets title in settings", () => {
      setStoreState({ title: "Dashboard Widget" });
      const { result } = renderHook(() => useBuildWidgetForSave(undefined));
      const widget = result.current();

      expect(widget.settings?.title).toBe("Dashboard Widget");
    });

    it("sets title to undefined when empty string", () => {
      setStoreState({ title: "" });
      const { result } = renderHook(() => useBuildWidgetForSave(undefined));
      const widget = result.current();

      expect(widget.settings?.title).toBeUndefined();
    });

    it("records query in history for regular chart types", () => {
      const addToQueryHistory = vi.fn();
      setStoreState({ addToQueryHistory });
      const { result } = renderHook(() => useBuildWidgetForSave(undefined));
      result.current();

      expect(addToQueryHistory).toHaveBeenCalledWith("MATCH (n) RETURN n");
    });

    it("includes templateId and templateSyncedAt when set", () => {
      setStoreState({
        templateId: "tmpl-1",
        templateSyncedAt: "2026-01-01T00:00:00Z",
      });
      const { result } = renderHook(() => useBuildWidgetForSave(undefined));
      const widget = result.current();

      expect(widget.templateId).toBe("tmpl-1");
      expect(widget.templateSyncedAt).toBe("2026-01-01T00:00:00Z");
    });
  });

  // ── Parameter-select widget ──────────────────────────────────────

  describe("parameter-select widget", () => {
    it("resolves parameterType and sets parameterName in chartOptions", () => {
      setStoreState({
        chartType: "parameter-select",
        paramUIType: "select",
        dateSub: "single",
        multiSelect: false,
        paramWidgetName: "myParam",
        chartOptions: { seedQuery: "RETURN 1" },
      });
      const { result } = renderHook(() => useBuildWidgetForSave(undefined));
      const widget = result.current();

      expect(widget.settings?.chartOptions).toEqual(
        expect.objectContaining({
          parameterType: "select",
          parameterName: "myParam",
          seedQuery: "RETURN 1",
        }),
      );
    });

    it("uses multi-select type when multiSelect is true", () => {
      setStoreState({
        chartType: "parameter-select",
        paramUIType: "select",
        multiSelect: true,
        paramWidgetName: "multi",
      });
      const { result } = renderHook(() => useBuildWidgetForSave(undefined));
      const widget = result.current();

      expect(widget.settings?.chartOptions).toEqual(
        expect.objectContaining({ parameterType: "multi-select" }),
      );
    });

    it("clears seedQuery when paramUIType is not select", () => {
      setStoreState({
        chartType: "parameter-select",
        paramUIType: "date",
        dateSub: "range",
        chartOptions: { seedQuery: "RETURN 1" },
      });
      const { result } = renderHook(() => useBuildWidgetForSave(undefined));
      const widget = result.current();

      expect(
        (widget.settings?.chartOptions as Record<string, unknown>)?.seedQuery,
      ).toBeUndefined();
    });

    it("sets empty connectionId for non-select paramUIType", () => {
      setStoreState({
        chartType: "parameter-select",
        paramUIType: "freetext",
        connectionId: "conn-1",
      });
      const { result } = renderHook(() => useBuildWidgetForSave(undefined));
      const widget = result.current();

      expect(widget.connectionId).toBe("");
    });

    it("preserves connectionId for select paramUIType", () => {
      setStoreState({
        chartType: "parameter-select",
        paramUIType: "select",
        connectionId: "conn-1",
      });
      const { result } = renderHook(() => useBuildWidgetForSave(undefined));
      const widget = result.current();

      expect(widget.connectionId).toBe("conn-1");
    });

    it("sets query to empty string", () => {
      setStoreState({
        chartType: "parameter-select",
        query: "some query",
      });
      const { result } = renderHook(() => useBuildWidgetForSave(undefined));
      const widget = result.current();

      expect(widget.query).toBe("");
    });

    it("does not record query in history", () => {
      const addToQueryHistory = vi.fn();
      setStoreState({
        chartType: "parameter-select",
        addToQueryHistory,
      });
      const { result } = renderHook(() => useBuildWidgetForSave(undefined));
      result.current();

      expect(addToQueryHistory).not.toHaveBeenCalled();
    });

    it("skips clickAction, stylingConfig, conditionalFormatting, cache, transforms", () => {
      const buildClickAction = vi.fn(() => ({ rules: [] }));
      const buildStylingConfig = vi.fn(() => ({ enabled: true, rules: [] }));
      setStoreState({
        chartType: "parameter-select",
        buildClickAction,
        buildStylingConfig,
        enableCache: true,
        transforms: [{ id: "t1" }],
        colorScales: [{ id: "cs1" }],
      });
      const { result } = renderHook(() => useBuildWidgetForSave(undefined));
      const widget = result.current();

      expect(widget.settings?.clickAction).toBeUndefined();
      expect(widget.settings?.stylingConfig).toBeUndefined();
      expect(widget.settings?.conditionalFormatting).toBeUndefined();
      expect(widget.settings?.enableCache).toBeUndefined();
      expect(widget.settings?.transforms).toBeUndefined();
    });
  });

  // ── Form widget ──────────────────────────────────────────────────

  describe("form widget", () => {
    it("includes formFields and refreshWidgetIds in settings", () => {
      setStoreState({
        chartType: "form",
        formFields: [{ id: "f1", label: "Name" }],
        refreshWidgetIds: ["w1", "w2"],
      });
      const { result } = renderHook(() => useBuildWidgetForSave(undefined));
      const widget = result.current();

      expect(widget.settings?.formFields).toEqual([
        { id: "f1", label: "Name" },
      ]);
      expect(
        (widget.settings?.chartOptions as Record<string, unknown>)
          ?.refreshWidgetIds,
      ).toEqual(["w1", "w2"]);
    });

    it("omits refreshWidgetIds when empty", () => {
      setStoreState({
        chartType: "form",
        formFields: [],
        refreshWidgetIds: [],
      });
      const { result } = renderHook(() => useBuildWidgetForSave(undefined));
      const widget = result.current();

      expect(
        (widget.settings?.chartOptions as Record<string, unknown>)
          ?.refreshWidgetIds,
      ).toBeUndefined();
    });

    it("skips clickAction, stylingConfig for form widgets", () => {
      setStoreState({ chartType: "form" });
      const { result } = renderHook(() => useBuildWidgetForSave(undefined));
      const widget = result.current();

      expect(widget.settings?.clickAction).toBeUndefined();
      expect(widget.settings?.stylingConfig).toBeUndefined();
    });
  });

  // ── Content-only widgets (markdown / iframe) ─────────────────────

  describe("content-only widgets", () => {
    it.each(["markdown", "iframe"])(
      "sets empty connectionId and query for %s",
      (type) => {
        setStoreState({
          chartType: type,
          connectionId: "conn-1",
          query: "some query",
        });
        const { result } = renderHook(() => useBuildWidgetForSave(undefined));
        const widget = result.current();

        expect(widget.connectionId).toBe("");
        expect(widget.query).toBe("");
      },
    );

    it.each(["markdown", "iframe"])(
      "does not record query in history for %s",
      (type) => {
        const addToQueryHistory = vi.fn();
        setStoreState({
          chartType: type,
          addToQueryHistory,
        });
        const { result } = renderHook(() => useBuildWidgetForSave(undefined));
        result.current();

        expect(addToQueryHistory).not.toHaveBeenCalled();
      },
    );

    it.each(["markdown", "iframe"])("skips settings extras for %s", (type) => {
      setStoreState({
        chartType: type,
        enableCache: true,
        colorScales: [{ id: "cs1" }],
      });
      const { result } = renderHook(() => useBuildWidgetForSave(undefined));
      const widget = result.current();

      expect(widget.settings?.clickAction).toBeUndefined();
      expect(widget.settings?.enableCache).toBeUndefined();
      expect(widget.settings?.conditionalFormatting).toBeUndefined();
    });
  });

  // ── Click action & styling ───────────────────────────────────────

  describe("click action and styling config", () => {
    it("includes clickAction when buildClickAction returns a value", () => {
      const action = {
        rules: [{ id: "r1", type: "set-parameter" }],
      };
      setStoreState({ buildClickAction: vi.fn(() => action) });
      const { result } = renderHook(() => useBuildWidgetForSave(undefined));
      const widget = result.current();

      expect(widget.settings?.clickAction).toEqual(action);
    });

    it("includes stylingConfig when buildStylingConfig returns a value", () => {
      const styling = { enabled: true, rules: [] };
      setStoreState({ buildStylingConfig: vi.fn(() => styling) });
      const { result } = renderHook(() => useBuildWidgetForSave(undefined));
      const widget = result.current();

      expect(widget.settings?.stylingConfig).toEqual(styling);
    });
  });

  // ── Conditional formatting ───────────────────────────────────────

  describe("conditional formatting", () => {
    it("includes colorScales when non-empty", () => {
      setStoreState({
        colorScales: [{ id: "cs1", column: "val", min: 0, max: 100 }],
      });
      const { result } = renderHook(() => useBuildWidgetForSave(undefined));
      const widget = result.current();

      expect(widget.settings?.conditionalFormatting).toEqual({
        colorScales: [{ id: "cs1", column: "val", min: 0, max: 100 }],
      });
    });

    it("omits conditionalFormatting when colorScales is empty", () => {
      setStoreState({ colorScales: [] });
      const { result } = renderHook(() => useBuildWidgetForSave(undefined));
      const widget = result.current();

      expect(widget.settings?.conditionalFormatting).toBeUndefined();
    });
  });

  // ── Caching ──────────────────────────────────────────────────────

  describe("caching", () => {
    it("includes cache settings for regular widgets", () => {
      setStoreState({ enableCache: true, cacheTtlMinutes: 10 });
      const { result } = renderHook(() => useBuildWidgetForSave(undefined));
      const widget = result.current();

      expect(widget.settings?.enableCache).toBe(true);
      expect(widget.settings?.cacheTtlMinutes).toBe(10);
    });
  });

  // ── Transforms ───────────────────────────────────────────────────

  describe("transforms", () => {
    it("includes transforms when non-empty", () => {
      setStoreState({
        transforms: [{ id: "t1", type: "sort" }],
        transformsEnabled: true,
      });
      const { result } = renderHook(() => useBuildWidgetForSave(undefined));
      const widget = result.current();

      expect(widget.settings?.transforms).toEqual([{ id: "t1", type: "sort" }]);
      expect(widget.settings?.transformsEnabled).toBe(true);
    });

    it("omits transforms when empty", () => {
      setStoreState({ transforms: [] });
      const { result } = renderHook(() => useBuildWidgetForSave(undefined));
      const widget = result.current();

      expect(widget.settings?.transforms).toBeUndefined();
    });
  });

  // ── Query history ────────────────────────────────────────────────

  describe("query history", () => {
    it("includes query history when non-empty", () => {
      setStoreState({
        queryHistory: [{ query: "MATCH (n) RETURN n", timestamp: 123 }],
      });
      const { result } = renderHook(() => useBuildWidgetForSave(undefined));
      const widget = result.current();

      expect(widget.settings?.queryHistory).toEqual([
        { query: "MATCH (n) RETURN n", timestamp: 123 },
      ]);
    });

    it("omits query history when empty", () => {
      setStoreState({ queryHistory: [] });
      const { result } = renderHook(() => useBuildWidgetForSave(undefined));
      const widget = result.current();

      expect(widget.settings?.queryHistory).toBeUndefined();
    });

    it("omits query history for parameter-select widgets", () => {
      setStoreState({
        chartType: "parameter-select",
        queryHistory: [{ query: "q", timestamp: 1 }],
      });
      const { result } = renderHook(() => useBuildWidgetForSave(undefined));
      const widget = result.current();

      expect(widget.settings?.queryHistory).toBeUndefined();
    });

    it("omits query history for content-only widgets", () => {
      setStoreState({
        chartType: "markdown",
        queryHistory: [{ query: "q", timestamp: 1 }],
      });
      const { result } = renderHook(() => useBuildWidgetForSave(undefined));
      const widget = result.current();

      expect(widget.settings?.queryHistory).toBeUndefined();
    });
  });

  // ── Existing settings merge ──────────────────────────────────────

  describe("existing settings merge", () => {
    it("merges new settings with existing widget settings", () => {
      const existing: DashboardWidget = {
        id: "w1",
        chartType: "bar",
        connectionId: "conn-1",
        query: "old",
        settings: { customProp: "keep-me" },
      };
      const { result } = renderHook(() => useBuildWidgetForSave(existing));
      const widget = result.current();

      // Existing settings spread + new settings overwrite
      expect(widget.settings?.customProp).toBe("keep-me");
      expect(widget.settings?.title).toBe("My Widget");
    });
  });

  // ── Layout passed to buildClickAction ────────────────────────────

  describe("layout", () => {
    it("passes layout to buildClickAction", () => {
      const buildClickAction = vi.fn(() => undefined);
      setStoreState({ buildClickAction });
      const layout = { pages: [] };
      const { result } = renderHook(() =>
        useBuildWidgetForSave(undefined, layout as never),
      );
      result.current();

      expect(buildClickAction).toHaveBeenCalledWith(layout);
    });
  });

  // ── Empty query skips history ────────────────────────────────────

  describe("empty query", () => {
    it("does not add whitespace-only query to history", () => {
      const addToQueryHistory = vi.fn();
      setStoreState({ query: "   ", addToQueryHistory });
      const { result } = renderHook(() => useBuildWidgetForSave(undefined));
      result.current();

      expect(addToQueryHistory).not.toHaveBeenCalled();
    });
  });
});
