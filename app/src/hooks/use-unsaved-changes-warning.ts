"use client";

import { useEffect, useCallback, useRef, useState } from "react";
import { useDashboardStore } from "@/stores/dashboard-store";

/**
 * Hook that warns users about unsaved changes when they try to:
 * 1. Close/refresh the browser tab (native beforeunload dialog)
 * 2. Navigate away within the app (intercepted pushState with ConfirmDialog)
 *
 * Returns state and handlers for rendering an in-app confirmation dialog.
 */
export function useUnsavedChangesWarning() {
  const hasUnsavedChanges = useDashboardStore((s) => s.hasUnsavedChanges);

  // State for the in-app navigation confirmation dialog
  const [showNavWarning, setShowNavWarning] = useState(false);
  const pendingUrl = useRef<string | null>(null);

  // ── 1. Browser close/refresh: beforeunload ───────────────────────
  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (hasUnsavedChanges()) {
        e.preventDefault();
      }
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [hasUnsavedChanges]);

  // ── 2. In-app navigation: intercept pushState ────────────────────
  useEffect(() => {
    const originalPushState = window.history.pushState.bind(window.history);

    window.history.pushState = function patchedPushState(
      data: unknown,
      unused: string,
      url?: string | URL | null
    ) {
      if (hasUnsavedChanges() && url) {
        // Block navigation and show the confirmation dialog
        pendingUrl.current = url.toString();
        setShowNavWarning(true);
        return; // Don't navigate yet
      }
      originalPushState(data, unused, url);
    };

    return () => {
      window.history.pushState = originalPushState;
    };
  }, [hasUnsavedChanges]);

  // User confirmed: proceed with navigation
  const confirmNavigation = useCallback(() => {
    setShowNavWarning(false);
    if (pendingUrl.current) {
      const url = pendingUrl.current;
      pendingUrl.current = null;
      // Temporarily bypass our interceptor by using location directly
      window.location.href = url;
    }
  }, []);

  // User cancelled: stay on the page
  const cancelNavigation = useCallback(() => {
    setShowNavWarning(false);
    pendingUrl.current = null;
  }, []);

  return {
    showNavWarning,
    setShowNavWarning,
    confirmNavigation,
    cancelNavigation,
  };
}
