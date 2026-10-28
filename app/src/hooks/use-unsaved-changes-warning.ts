"use client";

import { useEffect, useCallback, useRef, useState } from "react";
import { useDashboardStore } from "@/stores/dashboard-store";

/**
 * Hook that warns users about unsaved changes when they try to:
 * 1. Close/refresh the browser tab (native beforeunload dialog)
 * 2. Navigate away within the app (explicit requestNavigation guard)
 * 3. Press the browser Back button (a held same-URL history entry)
 *
 * Mounted once, in the dashboard layout, so the sidebar, the user menu and
 * the workspace all ask through the same instance (#2325). Returns state and
 * handlers for rendering an in-app confirmation dialog.
 */
export function useUnsavedChangesWarning() {
  const hasUnsavedChanges = useDashboardStore((s) => s.hasUnsavedChanges);

  // State for the in-app navigation confirmation dialog
  const [showNavWarning, setShowNavWarning] = useState(false);
  // It has no Trigger: focus goes back to what asked to leave (#2146).
  const [returnFocusTo, setReturnFocusTo] = useState<HTMLElement | null>(null);
  const warn = useCallback(() => {
    // Asked again while open, the focus is the question's own Stay.
    if (!showNavWarning) {
      setReturnFocusTo(document.activeElement as HTMLElement | null);
    }
    setShowNavWarning(true);
  }, [showNavWarning]);
  const pendingUrl = useRef<string | null>(null);
  const pendingLeave = useRef<(() => void) | null>(null);
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

  // ── 2. Browser back button: popstate ─────────────────────────────
  // By the time popstate fires the browser (and Next) have already moved, so
  // it cannot be undone. Instead, while dirty, one same-URL entry is held on
  // top of the editor's: Back pops only that one, the URL and the route stay
  // put, and "Stay" pushes it back (#2325).
  const sentinel = useRef(false);
  const pushSentinel = useCallback(() => {
    window.history.pushState(window.history.state, "", window.location.href);
    sentinel.current = true;
  }, []);

  useEffect(() => {
    return useDashboardStore.subscribe(() => {
      if (hasUnsavedChanges() && !sentinel.current) pushSentinel();
    });
  }, [hasUnsavedChanges, pushSentinel]);

  useEffect(() => {
    const handler = () => {
      // Our own back() after "Leave" lands here too: let it through.
      if (navigatingRef.current) return;
      sentinel.current = false;
      if (hasUnsavedChanges()) warn();
    };
    window.addEventListener("popstate", handler);
    return () => window.removeEventListener("popstate", handler);
  }, [hasUnsavedChanges, warn]);

  // Closed any way but Leave (Stay, Escape): hold the entry again.
  useEffect(() => {
    if (!showNavWarning && !sentinel.current && hasUnsavedChanges()) {
      pushSentinel();
    }
  }, [showNavWarning, hasUnsavedChanges, pushSentinel]);

  /**
   * Guard navigation: if unsaved changes exist, show dialog and return false.
   * If no unsaved changes, return true so the caller can navigate.
   * `onLeave` replaces the page load when the way out is not a URL (Sign out).
   *
   * Usage:
   *   if (requestNavigation(`/${id}`)) router.push(`/${id}`);
   */
  const requestNavigation = useCallback(
    (url: string, onLeave?: () => void): boolean => {
      if (hasUnsavedChanges()) {
        pendingUrl.current = url;
        pendingLeave.current = onLeave ?? null;
        warn();
        return false;
      }
      return true;
    },
    [hasUnsavedChanges, warn],
  );

  // User confirmed: proceed with navigation
  const confirmNavigation = useCallback(() => {
    setShowNavWarning(false);
    navigatingRef.current = true; // Bypass native beforeunload dialog
    const url = pendingUrl.current;
    const onLeave = pendingLeave.current;
    pendingUrl.current = null;
    pendingLeave.current = null;
    if (onLeave) {
      onLeave();
    } else if (url) {
      // Full-page navigation bypasses any SPA interceptors
      window.location.href = url;
    } else {
      // Back: the held entry is already popped. The workspace stays mounted
      // across the view route, so drop the edits it would keep.
      const { savedLayout, activePageIndex, setLayout } =
        useDashboardStore.getState();
      if (savedLayout) setLayout(savedLayout, activePageIndex);
      window.history.back();
    }
  }, []);

  // User cancelled: stay on the page
  const cancelNavigation = useCallback(() => {
    setShowNavWarning(false);
    pendingUrl.current = null;
    pendingLeave.current = null;
  }, []);

  return {
    showNavWarning,
    setShowNavWarning,
    returnFocusTo,
    confirmNavigation,
    cancelNavigation,
    requestNavigation,
  };
}
