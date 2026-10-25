import { useEffect, useState } from "react";

// Its own module so the Leaflet map can follow the theme without pulling ECharts.
/** Detect whether the document is currently in dark mode. */
export function isDarkMode(): boolean {
  if (typeof document === "undefined") return false;
  return document.documentElement.classList.contains("dark");
}

/**
 * Reactive dark-mode hook that listens to theme changes via:
 * 1. `<html class="dark">` mutations — the ground truth `isDarkMode` reads
 * 2. `neoboard-theme-change` custom event (dispatched by the app's useTheme)
 * 3. OS `prefers-color-scheme` media query changes
 * 4. `storage` events (cross-tab theme sync)
 *
 * (1) is the catch-all that makes the rest of the docstring's promise true —
 * the chart re-themes for any host that toggles the class, whether or not it
 * is NeoBoard's useTheme. (2)–(4) are kept because they land synchronously,
 * ahead of the observer's microtask.
 */
export function useDarkMode(): boolean {
  const [dark, setDark] = useState(isDarkMode);

  useEffect(() => {
    const sync = () => setDark(isDarkMode());

    // Any theme library toggling `<html class="dark">` — Storybook's theme
    // toolbar, next-themes, a manual toggle. Without this the chart keeps the
    // theme it mounted with: light-theme labels (#14161a) on a dark canvas.
    const observer = new MutationObserver(sync);
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["class"],
    });

    // App-level theme change event (NeoBoard's useTheme dispatches this)
    globalThis.addEventListener("neoboard-theme-change", sync);
    // Cross-tab sync (localStorage theme key changed in another tab)
    globalThis.addEventListener("storage", sync);
    // OS-level dark mode toggle
    const mql = globalThis.matchMedia?.("(prefers-color-scheme: dark)");
    mql?.addEventListener("change", sync);

    return () => {
      observer.disconnect();
      globalThis.removeEventListener("neoboard-theme-change", sync);
      globalThis.removeEventListener("storage", sync);
      mql?.removeEventListener("change", sync);
    };
  }, []);

  return dark;
}
