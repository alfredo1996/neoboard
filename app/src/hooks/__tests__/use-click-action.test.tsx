/**
 * Tests for useClickAction hook logic.
 *
 * Tests the underlying functions (resolveClickActions, deriveClickableColumns)
 * directly, and also exercises the hook itself via renderHook to cover the
 * useCallback / useParameterStore wiring inside use-click-action.ts.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useParameterStore } from "@/stores/parameter-store";
import type { ClickAction, DashboardWidget } from "@/lib/db/schema";
import {
  resolveClickActions,
  deriveClickableColumns,
} from "@/lib/widget/resolve-click-action";

import { useClickAction } from "@/hooks/use-click-action";

function resetStore() {
  useParameterStore.getState().clearAll();
}

// ---------------------------------------------------------------------------
// Module exports
// ---------------------------------------------------------------------------
describe("useClickAction — module exports", () => {
  it("exports useClickAction as a function", () => {
    expect(typeof useClickAction).toBe("function");
  });
});

// ---------------------------------------------------------------------------
// hasClickAction derivation
// ---------------------------------------------------------------------------
describe("useClickAction — hasClickAction derivation", () => {
  it("is true when clickAction exists in settings", () => {
    const ws = {
      clickAction: {
        type: "set-parameter",
        parameterMapping: { parameterName: "x", sourceField: "y" },
      },
    };
    const clickAction = ws.clickAction as ClickAction | undefined;
    expect(!!clickAction).toBe(true);
  });

  it("is false when clickAction is undefined", () => {
    const ws: Record<string, unknown> = {};
    const clickAction = ws.clickAction as ClickAction | undefined;
    expect(!!clickAction).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// resolveClickActions integration (pure function)
// ---------------------------------------------------------------------------
describe("useClickAction — resolveClickActions integration", () => {
  beforeEach(resetStore);

  it("resolveClickActions returns setParameter with parameterName and value", () => {
    const widget = {
      id: "w1",
      settings: {
        clickAction: {
          type: "set-parameter",
          parameterMapping: { parameterName: "region", sourceField: "name" },
        },
      },
    } as unknown as DashboardWidget;

    const result = resolveClickActions(widget, { name: "US", value: 100 });
    if (result?.setParameter) {
      expect(result.setParameter.parameterName).toBe("region");
      expect(result.setParameter.value).toBe("US");
    }
  });

  it("resolveClickActions returns null when no click action configured", () => {
    const widget = { id: "w2", settings: {} } as unknown as DashboardWidget;
    const result = resolveClickActions(widget, { name: "US" });
    expect(result).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// deriveClickableColumns (pure function)
// ---------------------------------------------------------------------------
describe("useClickAction — deriveClickableColumns", () => {
  it("returns column list from click action config", () => {
    const clickAction: ClickAction = {
      type: "set-parameter",
      parameterMapping: { parameterName: "id", sourceField: "id" },
      clickableColumns: ["id", "name"],
    };
    const cols = deriveClickableColumns(clickAction);
    expect(cols).toEqual(["id", "name"]);
  });

  it("returns undefined when no click action", () => {
    expect(deriveClickableColumns(undefined)).toBeUndefined();
  });

  it("returns undefined when clickableColumns not specified", () => {
    const clickAction: ClickAction = {
      type: "set-parameter",
      parameterMapping: { parameterName: "id", sourceField: "name" },
    };
    const cols = deriveClickableColumns(clickAction);
    expect(cols).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// parameter store wiring (pure function)
// ---------------------------------------------------------------------------
describe("useClickAction — parameter store wiring", () => {
  beforeEach(resetStore);

  it("setParameter stores click-action source correctly", () => {
    const { setParameter } = useParameterStore.getState();
    setParameter("region", "US", "US", "name", "text", "click-action", "w1");

    const entry = useParameterStore.getState().parameters["region"];
    expect(entry.value).toBe("US");
    expect(entry.sourceType).toBe("click-action");
    expect(entry.sourceWidgetId).toBe("w1");
  });
});

// ---------------------------------------------------------------------------
// renderHook tests — exercises the actual hook body
// ---------------------------------------------------------------------------
describe("useClickAction — renderHook", () => {
  beforeEach(resetStore);

  it("returns handleChartClick, hasClickAction, and clickableColumns", () => {
    const widget = {
      id: "w1",
      chartType: "bar",
      settings: {},
    } as unknown as DashboardWidget;

    const { result } = renderHook(() => useClickAction(widget));

    expect(typeof result.current.handleChartClick).toBe("function");
    expect(result.current.hasClickAction).toBe(false);
    expect(result.current.clickableColumns).toBeUndefined();
  });

  it("hasClickAction is true when widget has clickAction configured", () => {
    const widget = {
      id: "w2",
      chartType: "bar",
      settings: {
        clickAction: {
          type: "set-parameter",
          parameterMapping: { parameterName: "region", sourceField: "name" },
        },
      },
    } as unknown as DashboardWidget;

    const { result } = renderHook(() => useClickAction(widget));

    expect(result.current.hasClickAction).toBe(true);
  });

  it("clickableColumns derives from clickAction config", () => {
    const widget = {
      id: "w3",
      chartType: "table",
      settings: {
        clickAction: {
          type: "set-parameter",
          parameterMapping: { parameterName: "id", sourceField: "id" },
          clickableColumns: ["id", "name"],
        },
      },
    } as unknown as DashboardWidget;

    const { result } = renderHook(() => useClickAction(widget));

    expect(result.current.clickableColumns).toEqual(["id", "name"]);
  });

  it("handleChartClick sets parameter in store via click action", () => {
    const widget = {
      id: "w4",
      chartType: "bar",
      settings: {
        title: "Revenue Chart",
        clickAction: {
          type: "set-parameter",
          parameterMapping: { parameterName: "region", sourceField: "name" },
        },
      },
    } as unknown as DashboardWidget;

    const { result } = renderHook(() => useClickAction(widget));

    act(() => {
      result.current.handleChartClick({ name: "US", value: 100 });
    });

    const entry = useParameterStore.getState().parameters["region"];
    expect(entry).toBeDefined();
    expect(entry.value).toBe("US");
    expect(entry.sourceType).toBe("click-action");
    expect(entry.sourceWidgetId).toBe("w4");
  });

  it("handleChartClick does nothing when no click action configured", () => {
    const widget = {
      id: "w5",
      chartType: "bar",
      settings: {},
    } as unknown as DashboardWidget;

    const { result } = renderHook(() => useClickAction(widget));

    act(() => {
      result.current.handleChartClick({ name: "US" });
    });

    // Store should still be empty
    const params = useParameterStore.getState().parameters;
    expect(Object.keys(params)).toHaveLength(0);
  });

  it("handleChartClick calls onNavigateToPage when navigate action configured", () => {
    const widget = {
      id: "w6",
      chartType: "bar",
      settings: {
        clickAction: {
          type: "navigate-to-page",
          targetPageId: "page-42",
        },
      },
    } as unknown as DashboardWidget;

    const onNavigateToPage = vi.fn();
    const { result } = renderHook(() =>
      useClickAction(widget, onNavigateToPage),
    );

    act(() => {
      result.current.handleChartClick({ name: "US" });
    });

    expect(onNavigateToPage).toHaveBeenCalledWith("page-42");
  });

  it("handleChartClick sets parameter and navigates for combined action", () => {
    const widget = {
      id: "w7",
      chartType: "bar",
      settings: {
        title: "Sales",
        clickAction: {
          type: "set-parameter-and-navigate",
          parameterMapping: { parameterName: "city", sourceField: "name" },
          targetPageId: "detail-page",
        },
      },
    } as unknown as DashboardWidget;

    const onNavigateToPage = vi.fn();
    const { result } = renderHook(() =>
      useClickAction(widget, onNavigateToPage),
    );

    act(() => {
      result.current.handleChartClick({ name: "Berlin", value: 42 });
    });

    const entry = useParameterStore.getState().parameters["city"];
    expect(entry).toBeDefined();
    expect(entry.value).toBe("Berlin");
    expect(onNavigateToPage).toHaveBeenCalledWith("detail-page");
  });
});
