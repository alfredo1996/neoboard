"use client";

import { useCallback, useSyncExternalStore } from "react";

/** One app-wide key: the choice follows the user across dashboards (#2351). */
export const FILTER_BAR_KEY = "neoboard-filter-bar";

const listeners = new Set<() => void>();
// Only set when localStorage refuses a write, so the switch still works in this tab.
let fallback: boolean | null = null;

function read(): boolean {
  if (fallback !== null) return fallback;
  try {
    return localStorage.getItem(FILTER_BAR_KEY) !== "off";
  } catch {
    return true;
  }
}

function write(shown: boolean) {
  try {
    localStorage.setItem(FILTER_BAR_KEY, shown ? "on" : "off");
    fallback = null;
  } catch {
    fallback = shown;
  }
  listeners.forEach((l) => l());
}

function subscribe(l: () => void) {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
}

/** Whether the "Filtered by" strip is shown; shown unless the user turned it off. */
export function useFilterBarShown() {
  const shown = useSyncExternalStore(subscribe, read, () => true);
  return [shown, useCallback((s: boolean) => write(s), [])] as const;
}
