/**
 * Tests for use-countdown — pure helpers + useCountdown hook via renderHook.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import {
  getInitialSeconds,
  getNextCountdown,
  useCountdown,
} from "../use-countdown";

// ---------------------------------------------------------------------------
// Pure helper tests
// ---------------------------------------------------------------------------

describe("getInitialSeconds", () => {
  it("returns null when intervalMs is false", () => {
    expect(getInitialSeconds(false)).toBeNull();
  });

  it("returns whole seconds rounded up", () => {
    expect(getInitialSeconds(30_000)).toBe(30);
    expect(getInitialSeconds(60_000)).toBe(60);
    expect(getInitialSeconds(300_000)).toBe(300);
  });

  it("rounds up partial seconds", () => {
    expect(getInitialSeconds(1_500)).toBe(2);
    expect(getInitialSeconds(500)).toBe(1);
  });
});

describe("getNextCountdown", () => {
  it("decrements by 1 each tick", () => {
    expect(getNextCountdown(30, 30)).toBe(29);
    expect(getNextCountdown(5, 30)).toBe(4);
    expect(getNextCountdown(2, 30)).toBe(1);
  });

  it("resets to total when prev is 1", () => {
    expect(getNextCountdown(1, 30)).toBe(30);
  });

  it("resets to total when prev is null", () => {
    expect(getNextCountdown(null, 30)).toBe(30);
  });

  it("resets to total when prev is 0", () => {
    expect(getNextCountdown(0, 10)).toBe(10);
  });
});

// ---------------------------------------------------------------------------
// useCountdown hook tests (renderHook + fake timers)
// ---------------------------------------------------------------------------

describe("useCountdown hook", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns null when intervalMs is false (auto-refresh off)", () => {
    const { result } = renderHook(() => useCountdown(false));
    expect(result.current).toBeNull();
  });

  it("returns the initial seconds value immediately", () => {
    const { result } = renderHook(() => useCountdown(5_000));
    expect(result.current).toBe(5);
  });

  it("decrements by 1 after each second", () => {
    const { result } = renderHook(() => useCountdown(5_000));
    expect(result.current).toBe(5);

    act(() => {
      vi.advanceTimersByTime(1_000);
    });
    expect(result.current).toBe(4);

    act(() => {
      vi.advanceTimersByTime(1_000);
    });
    expect(result.current).toBe(3);
  });

  it("resets to total after reaching 1", () => {
    const { result } = renderHook(() => useCountdown(3_000));
    expect(result.current).toBe(3);

    // Tick down: 3 -> 2 -> 1 -> reset to 3
    act(() => {
      vi.advanceTimersByTime(1_000);
    });
    expect(result.current).toBe(2);

    act(() => {
      vi.advanceTimersByTime(1_000);
    });
    expect(result.current).toBe(1);

    act(() => {
      vi.advanceTimersByTime(1_000);
    });
    expect(result.current).toBe(3);
  });

  it("returns new starting value immediately when intervalMs changes", () => {
    const { result, rerender } = renderHook(
      ({ ms }: { ms: number | false }) => useCountdown(ms),
      { initialProps: { ms: 5_000 as number | false } },
    );
    expect(result.current).toBe(5);

    // Change interval — should immediately show new total
    rerender({ ms: 10_000 });
    expect(result.current).toBe(10);
  });

  it("returns null when intervalMs changes to false", () => {
    const { result, rerender } = renderHook(
      ({ ms }: { ms: number | false }) => useCountdown(ms),
      { initialProps: { ms: 5_000 as number | false } },
    );
    expect(result.current).toBe(5);

    rerender({ ms: false });
    expect(result.current).toBeNull();
  });

  it("clears interval on unmount (no timers leak)", () => {
    const { unmount } = renderHook(() => useCountdown(5_000));

    expect(vi.getTimerCount()).toBeGreaterThan(0);

    unmount();

    // The point is the leak, not the absence of a crash: an interval left
    // running is what this guards against.
    expect(vi.getTimerCount()).toBe(0);

    act(() => {
      vi.advanceTimersByTime(5_000);
    });
  });
});
