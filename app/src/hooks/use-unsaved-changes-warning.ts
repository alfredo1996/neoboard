"use client";

import { useEffect, useCallback, useRef, useState } from "react";
import { useDashboardStore } from "@/stores/dashboard-store";

/**
 * Hook that warns users about unsaved changes when they try to:
 * 1. Close/refresh the browser tab (native beforeunload dialog)
 * 2. Navigate away within the app (explicit requestNavigation guard)
 *
 * Returns state and handlers for rendering an in-app confirmation dialog.
 */
export function useUnsavedChangesWarning() {
  const hasUnsavedChanges = useDashboardStore((s) => s.hasUnsavedChanges);

  // State for the in-app navigation confirmation dialog
  const [showNavWarning, setShowNavWarning] = useState(false);
  const pendingUrl = useRef<string | null>(null);
  // When true, the user has confirmed "Leave" — skip the native beforeunload dialog
  const navigatingRef = useRef(false);

  // ── 1. Browser close/refresh: beforeunload ───────────────────────
  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (hasUnsavedChanges() && !navigatingRef.current) {
        e.preventDefault();
      }
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [hasUnsavedChanges]);

  // ── 2. Browser back/forward button: popstate ─────────────────────
  useEffect(() => {
    const handler = () => {
      if (hasUnsavedChanges()) {
        // Re-push current URL to stay on the page
        window.history.pushState(null, "", window.location.href);
        setShowNavWarning(true);
        // pendingUrl stays null — confirm will use history.back()
      }
    };
    window.addEventListener("popstate", handler);
    return () => window.removeEventListener("popstate", handler);
  }, [hasUnsavedChanges]);

  /**
   * Guard navigation: if unsaved changes exist, show dialog and return false.
   * If no unsaved changes, return true so the caller can navigate.
   *
   * Usage:
   *   if (requestNavigation(`/${id}`)) router.push(`/${id}`);
   */
  const requestNavigation = useCallback(
    (url: string): boolean => {
      if (hasUnsavedChanges()) {
        pendingUrl.current = url;
        setShowNavWarning(true);
        return false;
      }
      return true;
    },
    [hasUnsavedChanges],
  );

  // User confirmed: proceed with navigation
  const confirmNavigation = useCallback(() => {
    setShowNavWarning(false);
    navigatingRef.current = true; // Bypass native beforeunload dialog
    if (pendingUrl.current) {
      const url = pendingUrl.current;
      pendingUrl.current = null;
      // Full-page navigation bypasses any SPA interceptors
      window.location.href = url;
    } else {
      // Triggered from popstate — go back
      window.history.back();
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
    requestNavigation,
  };
}
