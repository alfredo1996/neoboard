"use client";

import { useState, useEffect, useCallback, useRef } from "react";

type Theme = "light" | "dark";

const STORAGE_KEY = "neoboard-theme";

function isTheme(value: string | null): value is Theme {
  return value === "light" || value === "dark";
}

function getStoredTheme(): Theme {
  if (typeof window === "undefined") return "light";
  const stored = localStorage.getItem(STORAGE_KEY);
  return isTheme(stored) ? stored : "light";
}

function applyTheme(theme: Theme) {
  document.documentElement.classList.toggle("dark", theme === "dark");
}

/**
 * Initialise from localStorage on the client. Returns "light" on the
 * server so the first SSR render is deterministic.
 */
function useInitialTheme(): Theme {
  // Safe to call getStoredTheme lazily – useState initialiser runs once.
  const [theme] = useState<Theme>(() => getStoredTheme());
  return theme;
}

export function useTheme() {
  const initial = useInitialTheme();
  const [theme, setThemeState] = useState<Theme>(initial);
  const isFirstRender = useRef(true);

  // Apply theme on every change (including initial mount)
  useEffect(() => {
    applyTheme(theme);
    isFirstRender.current = false;
  }, [theme]);

  const setTheme = useCallback((t: Theme) => {
    localStorage.setItem(STORAGE_KEY, t);
    setThemeState(t);
  }, []);

  const toggleTheme = useCallback(() => {
    setTheme(theme === "light" ? "dark" : "light");
  }, [theme, setTheme]);

  return { theme, setTheme, toggleTheme } as const;
}
