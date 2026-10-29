"use client";

import { useEffect, useCallback, useRef, useState } from "react";
import { usePathname } from "next/navigation";
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
  const pendingLeave = useRef<(() => void | Promise<void>) | null>(null);
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
  // The held entry is marked in the history state, not in a ref: a ref outlives
  // the entry (a clean router.push out of the editor, a reload) and the next
  // dirty editor then pushed nothing. Next writes its own state on every push,
  // so the marker goes with the entry.
  // ponytail: a held entry left under a saved editor makes Back look dead once;
  // removing it would race the router.push that follows a save.
  // Next rewrites history.state on every router.replace and drops the marker
  // while the entry stays: heldRef knows the entry is ours, so it is re-marked
  // instead of a second one pushed. Cleared when the entry is popped or the
  // route changes.
  const isHeld = () => window.history.state?.__nbGuard === true;
  const heldRef = useRef<string | null>(null);
  const pathname = usePathname();
  useEffect(() => {
    heldRef.current = null;
  }, [pathname]);
  const pushSentinel = useCallback(() => {
    heldRef.current = window.location.pathname;
    window.history.pushState(
      { ...window.history.state, __nbGuard: true },
      "",
      window.location.href,
    );
  }, []);

  useEffect(() => {
    return useDashboardStore.subscribe(() => {
      if (!hasUnsavedChanges() || isHeld()) return;
      if (heldRef.current !== window.location.pathname) pushSentinel();
      else {
        window.history.replaceState(
          { ...window.history.state, __nbGuard: true },
          "",
          window.location.href,
        );
      }
    });
  }, [hasUnsavedChanges, pushSentinel]);

  useEffect(() => {
    const handler = () => {
      // Our own URL leave lands here too: let it through, once.
      if (navigatingRef.current) {
        navigatingRef.current = false;
        return;
      }
      const heldPath = heldRef.current;
      heldRef.current = null;
      // A dialog dismissed by Escape leaves its exit behind: forget it.
      pendingUrl.current = null;
      pendingLeave.current = null;
      if (!hasUnsavedChanges()) return;
      // Back twice popped past the editor too: that is a Leave, not a question.
      if (heldPath !== null && window.location.pathname !== heldPath) {
        useDashboardStore.getState().reset();
        return;
      }
      warn();
    };
    window.addEventListener("popstate", handler);
    return () => window.removeEventListener("popstate", handler);
  }, [hasUnsavedChanges, warn]);

  // Closed any way but Leave (Stay, Escape): hold the entry again.
  useEffect(() => {
    if (!showNavWarning && !isHeld() && hasUnsavedChanges()) {
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
    (url: string, onLeave?: () => void | Promise<void>): boolean => {
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
    const url = pendingUrl.current;
    const onLeave = pendingLeave.current;
    pendingUrl.current = null;
    pendingLeave.current = null;
    if (onLeave) {
      navigatingRef.current = true; // Bypass native beforeunload dialog
      Promise.resolve(onLeave()).catch(() => {
        navigatingRef.current = false;
      });
    } else if (url) {
      navigatingRef.current = true;
      // Full-page navigation bypasses any SPA interceptors
      window.location.href = url;
    } else {
      // Back: the held entry is already popped. The workspace stays mounted
      // across the view route: empty the store and it reloads the server copy
      // (savedLayout can be stale: a version bump is skipped while dirty).
      // No navigatingRef: the store is clean, so the landing popstate is quiet
      // and a back() that goes nowhere leaves nothing unguarded.
      useDashboardStore.getState().reset();
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
