"use client";

import { useSyncExternalStore, useEffect, useCallback } from "react";

export type ThemePreference = "light" | "dark" | "system";
export type ResolvedTheme = "light" | "dark";

const STORAGE_KEY = "neoboard-theme";
const CHANGE_EVENT = "neoboard-theme-change";

function isPreference(value: string | null): value is ThemePreference {
  return value === "light" || value === "dark" || value === "system";
}

function getOsDark(): boolean {
  return globalThis.matchMedia?.("(prefers-color-scheme: dark)").matches ?? false;
}

function resolveTheme(pref: ThemePreference): ResolvedTheme {
  if (pref === "system") return getOsDark() ? "dark" : "light";
  return pref;
}

/** Returns "preference|resolved" so useSyncExternalStore detects OS changes. */
function getSnapshot(): string {
  const stored = localStorage.getItem(STORAGE_KEY);
  const pref = isPreference(stored) ? stored : "system";
  return `${pref}|${resolveTheme(pref)}`;
}

function getServerSnapshot(): string {
  return "system|light";
}

function subscribe(callback: () => void): () => void {
  globalThis.addEventListener("storage", callback);
  globalThis.addEventListener(CHANGE_EVENT, callback);

  const mql = globalThis.matchMedia?.("(prefers-color-scheme: dark)");
  mql?.addEventListener("change", callback);

  return () => {
    globalThis.removeEventListener("storage", callback);
    globalThis.removeEventListener(CHANGE_EVENT, callback);
    mql?.removeEventListener("change", callback);
  };
}

function applyTheme(resolved: ResolvedTheme) {
  document.documentElement.classList.toggle("dark", resolved === "dark");
}

export function useTheme() {
  const snapshot = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const [preference, resolvedTheme] = snapshot.split("|") as [ThemePreference, ResolvedTheme];

  useEffect(() => {
    applyTheme(resolvedTheme);
  }, [resolvedTheme]);

  const setTheme = useCallback((t: ThemePreference) => {
    localStorage.setItem(STORAGE_KEY, t);
    applyTheme(resolveTheme(t));
    globalThis.dispatchEvent(new Event(CHANGE_EVENT));
  }, []);

  return { preference, resolvedTheme, setTheme } as const;
}
