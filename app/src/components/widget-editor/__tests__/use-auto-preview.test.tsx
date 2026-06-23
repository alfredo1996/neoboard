import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useAutoPreview } from "../use-auto-preview";

// ── Mocks ──────────────────────────────────────────────────────────────────

vi.mock("@/hooks/use-widget-query", () => ({
  extractReferencedParams: vi.fn(
    (_q: string, allParams: Record<string, unknown>) => {
      // Simple mock: return params that match $param_<name> in query
      const result: Record<string, unknown> = {};
      const regex = /\$param_(\w+)/g;
      let match;
      while ((match = regex.exec(_q)) !== null) {
        const name = match[1];
        if (name in allParams) {
          result["param_" + name] = allParams[name];
        }
      }
      return result;
    },
  ),
  // Mirrors the real helper: a query is ready unless it references a
  // $param_<name> that is missing/empty in allParams (#1055).
  allReferencedParamsReady: vi.fn(
    (q: string, allParams: Record<string, unknown>) => {
      const regex = /\$param_(\w+)/g;
      let match;
      while ((match = regex.exec(q)) !== null) {
        const v = allParams[match[1]];
        if (
          v === undefined ||
          v === null ||
          v === "" ||
          (Array.isArray(v) && v.length === 0)
        ) {
          return false;
        }
      }
      return true;
    },
  ),
}));

vi.mock("@/lib/query/wrap-with-preview-limit", () => ({
  wrapWithPreviewLimit: vi.fn((q: string) => q + " LIMIT 25"),
}));

// ── Helpers ────────────────────────────────────────────────────────────────

function createDefaults(
  overrides: Partial<Parameters<typeof useAutoPreview>[0]> = {},
) {
  return {
    open: true,
    mode: "edit" as const,
    connectionId: "conn-1",
    query: "MATCH (n) RETURN n",
    chartType: "bar",
    allParamValues: {},
    selectedConnection: { id: "conn-1", type: "neo4j" } as Parameters<
      typeof useAutoPreview
    >[0]["selectedConnection"],
    initialPreviewData: undefined,
    previewQuery: { mutate: vi.fn() },
    buildWidgetForSave: vi.fn(() => ({
      id: "w1",
      chartType: "bar",
      connectionId: "conn-1",
      query: "MATCH (n) RETURN n",
    })),
    onSave: vi.fn(),
    onOpenChange: vi.fn(),
    ...overrides,
  };
}

// ── Tests ──────────────────────────────────────────────────────────────────

describe("useAutoPreview", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  // ── handlePreview ────────────────────────────────────────────────

  describe("handlePreview", () => {
    it("calls previewQuery.mutate with wrapped query and connectionId", () => {
      const opts = createDefaults();
      const { result } = renderHook(() => useAutoPreview(opts));

      act(() => {
        result.current.handlePreview();
      });

      expect(opts.previewQuery.mutate).toHaveBeenCalledWith({
        connectionId: "conn-1",
        query: "MATCH (n) RETURN n LIMIT 25",
        params: undefined,
      });
    });

    it("extracts referenced params when query contains $param_ tokens", () => {
      const opts = createDefaults({
        query: "MATCH (n) WHERE n.id = $param_myId RETURN n",
        allParamValues: { myId: 42 },
      });
      const { result } = renderHook(() => useAutoPreview(opts));

      act(() => {
        result.current.handlePreview();
      });

      expect(opts.previewQuery.mutate).toHaveBeenCalledWith(
        expect.objectContaining({
          params: { param_myId: 42 },
        }),
      );
    });

    it("does not mutate when connectionId is empty", () => {
      const opts = createDefaults({ connectionId: "" });
      const { result } = renderHook(() => useAutoPreview(opts));

      act(() => {
        result.current.handlePreview();
      });

      expect(opts.previewQuery.mutate).not.toHaveBeenCalled();
    });

    it("does not mutate when query is whitespace-only", () => {
      const opts = createDefaults({ query: "   " });
      const { result } = renderHook(() => useAutoPreview(opts));

      act(() => {
        result.current.handlePreview();
      });

      expect(opts.previewQuery.mutate).not.toHaveBeenCalled();
    });
  });

  // ── Auto-preview on open ─────────────────────────────────────────

  describe("auto-preview on open", () => {
    it("triggers preview after delay when dialog opens in edit mode", () => {
      const opts = createDefaults({ mode: "edit" });
      renderHook(() => useAutoPreview(opts));

      // delay for edit mode is 50ms
      act(() => {
        vi.advanceTimersByTime(50);
      });

      expect(opts.previewQuery.mutate).toHaveBeenCalledTimes(1);
    });

    it("uses longer delay for add mode", () => {
      const opts = createDefaults({ mode: "add" });
      renderHook(() => useAutoPreview(opts));

      act(() => {
        vi.advanceTimersByTime(50);
      });
      expect(opts.previewQuery.mutate).not.toHaveBeenCalled();

      act(() => {
        vi.advanceTimersByTime(250);
      });
      expect(opts.previewQuery.mutate).toHaveBeenCalledTimes(1);
    });

    it("skips auto-preview when initialPreviewData is provided", () => {
      const opts = createDefaults({
        initialPreviewData: { data: [], resultId: "r1" },
      });
      renderHook(() => useAutoPreview(opts));

      act(() => {
        vi.advanceTimersByTime(1000);
      });

      expect(opts.previewQuery.mutate).not.toHaveBeenCalled();
    });

    it("skips auto-preview when dialog is closed", () => {
      const opts = createDefaults({ open: false });
      renderHook(() => useAutoPreview(opts));

      act(() => {
        vi.advanceTimersByTime(1000);
      });

      expect(opts.previewQuery.mutate).not.toHaveBeenCalled();
    });

    it("skips auto-preview when connectionId is empty", () => {
      const opts = createDefaults({ connectionId: "" });
      renderHook(() => useAutoPreview(opts));

      act(() => {
        vi.advanceTimersByTime(1000);
      });

      expect(opts.previewQuery.mutate).not.toHaveBeenCalled();
    });

    it("skips auto-preview when query is empty", () => {
      const opts = createDefaults({ query: "" });
      renderHook(() => useAutoPreview(opts));

      act(() => {
        vi.advanceTimersByTime(1000);
      });

      expect(opts.previewQuery.mutate).not.toHaveBeenCalled();
    });

    it("does not re-trigger on re-render once auto-preview has fired", () => {
      const opts = createDefaults({ mode: "edit" });
      const { rerender } = renderHook(() => useAutoPreview(opts));

      act(() => {
        vi.advanceTimersByTime(50);
      });
      expect(opts.previewQuery.mutate).toHaveBeenCalledTimes(1);

      rerender();
      act(() => {
        vi.advanceTimersByTime(1000);
      });
      // Still only 1 call from auto-preview (the debounced query-change effect
      // won't fire because prevQueryRef === query)
      expect(opts.previewQuery.mutate).toHaveBeenCalledTimes(1);
    });
  });

  // ── Query change debounce ────────────────────────────────────────

  describe("query-change debounce", () => {
    it("re-runs preview 800ms after query changes", () => {
      const opts = createDefaults({ mode: "edit" });
      const { rerender } = renderHook((props) => useAutoPreview(props), {
        initialProps: opts,
      });

      // auto-preview fires first
      act(() => {
        vi.advanceTimersByTime(50);
      });
      expect(opts.previewQuery.mutate).toHaveBeenCalledTimes(1);

      // change query
      const updated = { ...opts, query: "MATCH (m) RETURN m" };
      rerender(updated);

      act(() => {
        vi.advanceTimersByTime(500);
      });
      // not yet — debounce is 800ms
      expect(opts.previewQuery.mutate).toHaveBeenCalledTimes(1);

      act(() => {
        vi.advanceTimersByTime(300);
      });
      expect(opts.previewQuery.mutate).toHaveBeenCalledTimes(2);
    });
  });

  // ── handleRunAndSave (CMD+Shift+Enter) ───────────────────────────

  describe("handleRunAndSave", () => {
    it("skips for markdown chart type", () => {
      const opts = createDefaults({ chartType: "markdown" });
      renderHook(() => useAutoPreview(opts));

      act(() => {
        const event = new KeyboardEvent("keydown", {
          key: "Enter",
          metaKey: true,
          shiftKey: true,
        });
        document.dispatchEvent(event);
        vi.advanceTimersByTime(100);
      });

      // mutate is called for auto-preview but NOT for run-and-save path
      // Since markdown doesn't need a connection, auto-preview fires normally.
      // The run-and-save should short-circuit before calling mutate with save callbacks.
      // We verify by checking onSave was never called.
      expect(opts.onSave).not.toHaveBeenCalled();
    });

    it("skips for iframe chart type", () => {
      const opts = createDefaults({ chartType: "iframe" });
      renderHook(() => useAutoPreview(opts));

      act(() => {
        const event = new KeyboardEvent("keydown", {
          key: "Enter",
          metaKey: true,
          shiftKey: true,
        });
        document.dispatchEvent(event);
        vi.advanceTimersByTime(100);
      });

      expect(opts.onSave).not.toHaveBeenCalled();
    });

    it("skips when query is empty", () => {
      const opts = createDefaults({ query: "   " });
      renderHook(() => useAutoPreview(opts));

      act(() => {
        const event = new KeyboardEvent("keydown", {
          key: "Enter",
          metaKey: true,
          shiftKey: true,
        });
        document.dispatchEvent(event);
        vi.advanceTimersByTime(100);
      });

      expect(opts.onSave).not.toHaveBeenCalled();
    });

    it("calls onSave and onOpenChange(false) on success", () => {
      const mutate = vi.fn();
      const opts = createDefaults({ previewQuery: { mutate } });
      renderHook(() => useAutoPreview(opts));

      // drain auto-preview
      act(() => {
        vi.advanceTimersByTime(50);
      });
      mutate.mockClear();

      // trigger CMD+Shift+Enter
      act(() => {
        const event = new KeyboardEvent("keydown", {
          key: "Enter",
          metaKey: true,
          shiftKey: true,
        });
        document.dispatchEvent(event);
      });

      expect(mutate).toHaveBeenCalledTimes(1);
      const [, callbacks] = mutate.mock.calls[0];

      // simulate success
      act(() => {
        callbacks.onSuccess();
        vi.advanceTimersByTime(1500);
      });

      expect(opts.buildWidgetForSave).toHaveBeenCalled();
      expect(opts.onSave).toHaveBeenCalled();
      expect(opts.onOpenChange).toHaveBeenCalledWith(false);
    });

    it("resets saveStatus to idle on error", () => {
      const mutate = vi.fn();
      const opts = createDefaults({ previewQuery: { mutate } });
      const { result } = renderHook(() => useAutoPreview(opts));

      act(() => {
        vi.advanceTimersByTime(50);
      });
      mutate.mockClear();

      // trigger
      act(() => {
        const event = new KeyboardEvent("keydown", {
          key: "Enter",
          metaKey: true,
          shiftKey: true,
        });
        document.dispatchEvent(event);
      });

      expect(result.current.saveStatus).toBe("saving");

      const [, callbacks] = mutate.mock.calls[0];
      act(() => {
        callbacks.onError();
      });

      expect(result.current.saveStatus).toBe("idle");
    });

    it("responds to ctrlKey instead of metaKey", () => {
      const mutate = vi.fn();
      const opts = createDefaults({ previewQuery: { mutate } });
      renderHook(() => useAutoPreview(opts));

      act(() => {
        vi.advanceTimersByTime(50);
      });
      mutate.mockClear();

      act(() => {
        const event = new KeyboardEvent("keydown", {
          key: "Enter",
          ctrlKey: true,
          shiftKey: true,
        });
        document.dispatchEvent(event);
      });

      expect(mutate).toHaveBeenCalledTimes(1);
    });

    it("does not register keyboard shortcut when dialog is closed", () => {
      const mutate = vi.fn();
      const opts = createDefaults({ open: false, previewQuery: { mutate } });
      renderHook(() => useAutoPreview(opts));

      act(() => {
        const event = new KeyboardEvent("keydown", {
          key: "Enter",
          metaKey: true,
          shiftKey: true,
        });
        document.dispatchEvent(event);
      });

      // No calls at all (no auto-preview, no run-and-save)
      expect(mutate).not.toHaveBeenCalled();
    });
  });

  // ── saveStatus lifecycle ─────────────────────────────────────────

  describe("saveStatus", () => {
    it("returns idle initially", () => {
      const opts = createDefaults();
      const { result } = renderHook(() => useAutoPreview(opts));
      expect(result.current.saveStatus).toBe("idle");
    });

    it("transitions saving -> saved -> idle after success", () => {
      const mutate = vi.fn();
      const opts = createDefaults({ previewQuery: { mutate } });
      const { result } = renderHook(() => useAutoPreview(opts));

      act(() => {
        vi.advanceTimersByTime(50);
      });
      mutate.mockClear();

      act(() => {
        const event = new KeyboardEvent("keydown", {
          key: "Enter",
          metaKey: true,
          shiftKey: true,
        });
        document.dispatchEvent(event);
      });

      expect(result.current.saveStatus).toBe("saving");

      const [, callbacks] = mutate.mock.calls[0];
      act(() => {
        callbacks.onSuccess();
      });
      expect(result.current.saveStatus).toBe("saved");

      act(() => {
        vi.advanceTimersByTime(1500);
      });
      expect(result.current.saveStatus).toBe("idle");
    });
  });

  // ── Cleanup on close ─────────────────────────────────────────────

  describe("cleanup on close", () => {
    it("resets autoPreviewTriggered when dialog closes", () => {
      const opts = createDefaults({ mode: "edit" });
      const { rerender } = renderHook((props) => useAutoPreview(props), {
        initialProps: opts,
      });

      act(() => {
        vi.advanceTimersByTime(50);
      });
      expect(opts.previewQuery.mutate).toHaveBeenCalledTimes(1);

      // close
      rerender({ ...opts, open: false });

      // re-open => should trigger auto-preview again
      (opts.previewQuery.mutate as ReturnType<typeof vi.fn>).mockClear();
      rerender({ ...opts, open: true });

      act(() => {
        vi.advanceTimersByTime(50);
      });
      expect(opts.previewQuery.mutate).toHaveBeenCalledTimes(1);
    });
  });
});
