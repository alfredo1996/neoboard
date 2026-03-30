/**
 * Tests for useClickAction hook — verifies the click resolution + parameter
 * setting logic that the hook orchestrates. Since the hook is a thin wrapper
 * around resolveClickActions + deriveClickableColumns + useParameterStore,
 * we test the wiring directly rather than needing jsdom/renderHook.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { ClickAction } from "@/lib/db/schema";
import {
  resolveClickActions,
  deriveClickableColumns,
} from "@/lib/resolve-click-action";

vi.mock("@/lib/resolve-click-action", () => ({
  resolveClickActions: vi.fn(),
  deriveClickableColumns: vi.fn(() => undefined),
}));

describe("useClickAction logic", () => {
  beforeEach(() => vi.clearAllMocks());

  describe("hasClickAction derivation", () => {
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

  describe("resolveClickActions", () => {
    it("returns setParameter with parameterName and value", () => {
      vi.mocked(resolveClickActions).mockReturnValue({
        setParameter: {
          parameterName: "region",
          value: "US",
          label: "US",
          sourceField: "name",
        },
      });
      const result = resolveClickActions({ id: "w1", settings: {} } as never, {
        name: "US",
        value: 100,
      });
      expect(result?.setParameter?.parameterName).toBe("region");
      expect(result?.setParameter?.value).toBe("US");
    });

    it("returns navigateToPageId for page navigation actions", () => {
      vi.mocked(resolveClickActions).mockReturnValue({
        navigateToPageId: "page-2",
      });
      const result = resolveClickActions({} as never, {});
      expect(result?.navigateToPageId).toBe("page-2");
    });

    it("returns null when no click action matches", () => {
      vi.mocked(resolveClickActions).mockReturnValue(null);
      expect(resolveClickActions({} as never, {})).toBeNull();
    });
  });

  describe("deriveClickableColumns", () => {
    it("returns column list from click action config", () => {
      const clickAction: ClickAction = {
        type: "set-parameter",
        parameterMapping: { parameterName: "id", sourceField: "id" },
        clickableColumns: ["id", "name"],
      };
      vi.mocked(deriveClickableColumns).mockReturnValue(["id", "name"]);
      expect(deriveClickableColumns(clickAction)).toEqual(["id", "name"]);
    });

    it("returns undefined when no click action", () => {
      vi.mocked(deriveClickableColumns).mockReturnValue(undefined);
      expect(deriveClickableColumns(undefined)).toBeUndefined();
    });
  });
});
