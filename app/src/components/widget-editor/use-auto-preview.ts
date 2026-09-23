"use client";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import {
  extractReferencedParams,
  allReferencedParamsReady,
} from "@/hooks/use-widget-query";
import type { DashboardWidget } from "@/lib/db/schema";

/**
 * Rows the widget editor's preview shows (#1043). Sent as the request's
 * `rowLimit`: the query text goes out exactly as typed, and the driver stops
 * pulling rows at the cap (#1896).
 */
export const PREVIEW_ROW_LIMIT = 25;

interface UseAutoPreviewOptions {
  open: boolean;
  mode: "add" | "edit" | "lab-edit" | "lab-create";
  connectionId: string;
  query: string;
  chartType: string;
  allParamValues: Record<string, unknown>;
  /** Pre-existing preview data — skip auto-preview when provided */
  initialPreviewData?: { data: unknown; resultId: string };
  /** The query `initialPreviewData` is the result of. The editor loads it into
   *  the store after opening; that load is not an edit to preview. */
  initialPreviewQuery?: string;
  /** Mutation object from useQueryExecution */
  previewQuery: {
    mutate: (
      args: {
        connectionId: string;
        query: string;
        params?: Record<string, unknown>;
        rowLimit?: number;
      },
      options?: {
        onSuccess?: () => void;
        onError?: () => void;
      },
    ) => void;
  };
  buildWidgetForSave: () => DashboardWidget;
  onSave: (widget: DashboardWidget) => void;
  onOpenChange: (open: boolean) => void;
}

export function useAutoPreview({
  open,
  mode,
  connectionId,
  query,
  chartType,
  allParamValues,
  initialPreviewData,
  initialPreviewQuery,
  previewQuery,
  buildWidgetForSave,
  onSave,
  onOpenChange,
}: UseAutoPreviewOptions) {
  const connectionIdRef = useRef(connectionId);
  const queryRef = useRef(query);
  const allParamValuesRef = useRef(allParamValues);
  const previewQueryRef = useRef(previewQuery);
  const savedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // A run-and-save in flight. No preview may run meanwhile: a later `mutate`
  // supersedes this one's callbacks — TanStack fires them only for the latest
  // call — so the widget never saves and the status stays "saving" (#1912).
  const savingRef = useRef(false);

  useLayoutEffect(() => {
    connectionIdRef.current = connectionId;
    queryRef.current = query;
    allParamValuesRef.current = allParamValues;
    previewQueryRef.current = previewQuery;
  });

  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved">(
    "idle",
  );

  // What the last run sent. The preview is a mutation, so every run empties its
  // data until the result lands, and the Transform tab unmounts its controls
  // while it is empty — an auto-run of what just ran re-opened that window for
  // nothing (#1762). Auto-runs skip a repeat; a manual Run always runs.
  const lastRunRef = useRef<string | null>(null);

  /**
   * What a run sends — one builder for the preview and for run-and-save, so
   * they cannot drift apart again. Run-and-save built its own and forgot the
   * parameters, so every query with a $param_ token failed and never saved
   * (#1912). `null` while there is nothing that can run.
   */
  const buildRunInput = useCallback(() => {
    const cId = connectionIdRef.current;
    const q = queryRef.current;
    if (!cId || !q.trim()) return null;
    // Don't run a query that still has unbound $param_x tokens — the literal
    // token would surface a raw `syntax error at or near "$"` in the editor
    // preview. Mirror the dashboard's "Waiting for parameters…" state by
    // skipping the run (#1055).
    if (!allReferencedParamsReady(q, allParamValuesRef.current)) return null;
    const referenced = extractReferencedParams(q, allParamValuesRef.current);
    return {
      connectionId: cId,
      query: q,
      params: Object.keys(referenced).length > 0 ? referenced : undefined,
      rowLimit: PREVIEW_ROW_LIMIT,
    };
  }, []);

  const runPreview = useCallback(
    (auto: boolean) => {
      if (savingRef.current) return;
      const input = buildRunInput();
      if (!input) return;
      const key = JSON.stringify(input);
      if (auto && key === lastRunRef.current) return;
      lastRunRef.current = key;
      previewQueryRef.current.mutate(input);
    },
    [buildRunInput],
  );

  const handlePreview = useCallback(() => runPreview(false), [runPreview]);

  // Auto-run preview when connection and query are present so column selectors
  // are populated. Skip if initialPreviewData was provided.
  const autoPreviewTriggered = useRef(false);
  useEffect(() => {
    if (!open) {
      autoPreviewTriggered.current = false;
      // The modal resets the preview on open, so a reopen must run again.
      lastRunRef.current = null;
      return;
    }
    if (autoPreviewTriggered.current) return;
    if (!connectionId || !query.trim()) return;
    if (initialPreviewData) {
      autoPreviewTriggered.current = true;
      return;
    }
    autoPreviewTriggered.current = true;
    const delay = mode === "add" ? 300 : 50;
    const timer = setTimeout(() => {
      runPreview(true);
    }, delay);
    return () => clearTimeout(timer);
  }, [open, mode, connectionId, query, runPreview, initialPreviewData]);

  // Auto-run preview when the query changes (debounced 800ms).
  const prevQueryRef = useRef(query);
  useEffect(() => {
    if (!open) return;
    if (prevQueryRef.current === query) return;
    prevQueryRef.current = query;
    if (!connectionId || !query.trim()) return;
    // Opening another widget: the first open render still has the last
    // widget's query, then the store loads this one's. Its result is already
    // shown, so skip that change until something else has run (#1809).
    if (
      initialPreviewData &&
      query === initialPreviewQuery &&
      lastRunRef.current === null
    ) {
      return;
    }
    const timer = setTimeout(() => {
      runPreview(true);
    }, 800);
    return () => clearTimeout(timer);
  }, [
    open,
    query,
    connectionId,
    runPreview,
    initialPreviewData,
    initialPreviewQuery,
  ]);

  // CMD+Shift+Enter: run query, then save on success. Save only if it runs:
  // while a parameter is unset it cannot, and the preview already says so
  // ("Waiting for parameters…"); the Save button still saves (#1912).
  const handleRunAndSave = useCallback(() => {
    if (chartType === "markdown" || chartType === "iframe") return;
    if (saveStatus === "saving") return;
    const input = buildRunInput();
    if (!input) return;
    const ran = JSON.stringify(input);
    savingRef.current = true;
    // Recorded like any run, so replaying the held-back preview after a failed
    // save skips it when nothing changed: its failure is already shown.
    lastRunRef.current = ran;
    setSaveStatus("saving");
    // Nothing is saved: back to idle, and the preview held back while this
    // was pending — the query edited meanwhile — runs now, or the preview
    // shows the old query's result.
    const settleUnsaved = () => {
      savingRef.current = false;
      setSaveStatus("idle");
      runPreview(true);
    };
    previewQueryRef.current.mutate(input, {
      onSuccess: () => {
        // Save only if it ran: a query edited while this was pending is not
        // the one that ran, and would be saved untried.
        if (JSON.stringify(buildRunInput()) !== ran) return settleUnsaved();
        savingRef.current = false;
        if (savedTimerRef.current !== null) {
          clearTimeout(savedTimerRef.current);
        }
        setSaveStatus("saved");
        savedTimerRef.current = setTimeout(() => {
          setSaveStatus("idle");
          savedTimerRef.current = null;
        }, 1500);
        const widgetToSave = buildWidgetForSave();
        onSave(widgetToSave);
        onOpenChange(false);
      },
      onError: settleUnsaved,
    });
  }, [
    saveStatus,
    chartType,
    buildRunInput,
    runPreview,
    buildWidgetForSave,
    onSave,
    onOpenChange,
  ]);

  // Register keyboard shortcut
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key === "Enter") {
        e.preventDefault();
        handleRunAndSave();
      }
    };
    document.addEventListener("keydown", handler);
    return () => {
      document.removeEventListener("keydown", handler);
    };
  }, [open, handleRunAndSave]);

  // Clean up the "saved" feedback timer when the modal is closed.
  useEffect(() => {
    if (!open && savedTimerRef.current !== null) {
      clearTimeout(savedTimerRef.current);
      savedTimerRef.current = null;
    }
  }, [open]);

  return { handlePreview, saveStatus };
}
