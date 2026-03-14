"use client";

import { useSyncExternalStore, useEffect, useCallback } from "react";

type Theme = "light" | "dark";

const STORAGE_KEY = "neoboard-theme";
const CHANGE_EVENT = "neoboard-theme-change";

function isTheme(value: string | null): value is Theme {
  return value === "light" || value === "dark";
}

function getSnapshot(): Theme {
  const stored = localStorage.getItem(STORAGE_KEY);
  return isTheme(stored) ? stored : "light";
}

function getServerSnapshot(): Theme {
  return "light";
}

function subscribe(callback: () => void): () => void {
  globalThis.addEventListener("storage", callback);
  globalThis.addEventListener(CHANGE_EVENT, callback);
  return () => {
    globalThis.removeEventListener("storage", callback);
    globalThis.removeEventListener(CHANGE_EVENT, callback);
  };
}

function applyTheme(theme: Theme) {
  document.documentElement.classList.toggle("dark", theme === "dark");
}

export function useTheme() {
  const theme = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  // Sync the CSS class to the document whenever theme changes
  useEffect(() => {
    applyTheme(theme);
  }, [theme]);

  const setTheme = useCallback((t: Theme) => {
    localStorage.setItem(STORAGE_KEY, t);
    applyTheme(t);
    globalThis.dispatchEvent(new Event(CHANGE_EVENT));
  }, []);

  const toggleTheme = useCallback(() => {
    const next = getSnapshot() === "light" ? "dark" : "light";
    setTheme(next);
  }, [setTheme]);

  return { theme, setTheme, toggleTheme } as const;
}
