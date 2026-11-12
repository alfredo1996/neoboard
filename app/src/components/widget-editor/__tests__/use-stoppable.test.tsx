import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useStoppable, STOPPABLE_AFTER_MS } from "../use-stoppable";

describe("useStoppable (#2445)", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  const render = (isPending: boolean, submittedAt?: number) =>
    renderHook((p) => useStoppable(p.isPending, p.submittedAt), {
      initialProps: { isPending, submittedAt },
    });

  it("is false until the run has been pending for the delay", () => {
    const { result } = render(true, 1);
    expect(result.current).toBe(false);
    act(() => vi.advanceTimersByTime(STOPPABLE_AFTER_MS - 1));
    expect(result.current).toBe(false);
    act(() => vi.advanceTimersByTime(1));
    expect(result.current).toBe(true);
  });

  it("restarts the delay when a new run supersedes the old one", () => {
    const { result, rerender } = render(true, 1);
    act(() => vi.advanceTimersByTime(STOPPABLE_AFTER_MS));
    expect(result.current).toBe(true);
    rerender({ isPending: true, submittedAt: 2 });
    expect(result.current).toBe(false);
    act(() => vi.advanceTimersByTime(STOPPABLE_AFTER_MS));
    expect(result.current).toBe(true);
  });

  it("is false again once the run settles", () => {
    const { result, rerender } = render(true, 1);
    act(() => vi.advanceTimersByTime(STOPPABLE_AFTER_MS));
    rerender({ isPending: false, submittedAt: 1 });
    expect(result.current).toBe(false);
  });
});
