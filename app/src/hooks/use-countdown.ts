import { useState, useEffect } from "react";

// ---------------------------------------------------------------------------
// Pure helpers — exported for unit tests
// ---------------------------------------------------------------------------

/** Returns the starting number of whole seconds for the countdown, or null when off. */
export function getInitialSeconds(intervalMs: number | false): number | null {
  if (intervalMs === false) return null;
  return Math.ceil(intervalMs / 1000);
}

/**
 * Returns the next countdown value.
 * Decrements by 1 each tick; resets to `total` when `prev` reaches 1 (or is null).
 */
export function getNextCountdown(prev: number | null, total: number): number {
  if (prev === null || prev <= 1) return total;
  return prev - 1;
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

/**
 * Counts down from `intervalMs / 1000` seconds to 1, then resets.
 * Returns the number of whole seconds remaining until the next auto-refresh,
 * or `null` when auto-refresh is off (`intervalMs === false`).
 *
 * State shape: { left, forTotal } — `forTotal` tracks which interval the
 * `left` value was computed for, so that when `intervalMs` changes the
 * render can immediately return the new starting value without needing a
 * synchronous setState inside the effect.
 */
export function useCountdown(intervalMs: number | false): number | null {
  const total = getInitialSeconds(intervalMs);

  const [state, setState] = useState<{ left: number | null; forTotal: number | null }>({
    left: total,
    forTotal: total,
  });

  useEffect(() => {
    if (total === null) return;
    const t = total; // stable capture for the closure
    const timer = setInterval(() => {
      setState((prev) => ({
        left: prev.forTotal === t ? getNextCountdown(prev.left, t) : t,
        forTotal: t,
      }));
    }, 1_000);
    return () => clearInterval(timer);
  }, [total]);

  // If total changed since the last setState tick, return the new starting
  // value immediately so the UI doesn't flash a stale number.
  if (total === null) return null;
  return state.forTotal === total ? state.left : total;
}
