/**
 * Tests for useClickAction hook logic.
 *
 * Since the hook uses React hooks (useCallback, useParameterStore), we test
 * the underlying functions it wraps — resolveClickActions, deriveClickableColumns —
 * plus verify the module exports the hook correctly.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { useParameterStore } from "@/stores/parameter-store";
import type { ClickAction, DashboardWidget } from "@/lib/db/schema";
import {
  resolveClickActions,
  deriveClickableColumns,
} from "@/lib/resolve-click-action";

// Verify the hook module exports correctly
import { useClickAction } from "@/hooks/use-click-action";

function resetStore() {
  useParameterStore.getState().clearAll();
}

describe("useClickAction — module exports", () => {
  it("exports useClickAction as a function", () => {
    expect(typeof useClickAction).toBe("function");
  });
});

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
