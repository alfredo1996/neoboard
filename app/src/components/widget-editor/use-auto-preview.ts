"use client";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import type { ConnectionListItem } from "@/hooks/use-connections";
import {
  extractReferencedParams,
  allReferencedParamsReady,
} from "@/hooks/use-widget-query";
import { wrapWithPreviewLimit } from "@/lib/query/wrap-with-preview-limit";
import type { DashboardWidget } from "@/lib/db/schema";

interface UseAutoPreviewOptions {
  open: boolean;
  mode: "add" | "edit" | "lab-edit" | "lab-create";
  connectionId: string;
  query: string;
  chartType: string;
  allParamValues: Record<string, unknown>;
  selectedConnection: ConnectionListItem | undefined;
  /** Pre-existing preview data — skip auto-preview when provided */
  initialPreviewData?: { data: unknown; resultId: string };
  /** Mutation object from useQueryExecution */
  previewQuery: {
    mutate: (
      args: {
        connectionId: string;
        query: string;
        params?: Record<string, unknown>;
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
  selectedConnection,
  initialPreviewData,
  previewQuery,
  buildWidgetForSave,
  onSave,
  onOpenChange,
}: UseAutoPreviewOptions) {
  const connectionIdRef = useRef(connectionId);
  const queryRef = useRef(query);
  const allParamValuesRef = useRef(allParamValues);
  const selectedConnectionRef = useRef(selectedConnection);
  const previewQueryRef = useRef(previewQuery);
  const savedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useLayoutEffect(() => {
    connectionIdRef.current = connectionId;
    queryRef.current = query;
    allParamValuesRef.current = allParamValues;
    selectedConnectionRef.current = selectedConnection;
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

  const runPreview = useCallback((auto: boolean) => {
    const cId = connectionIdRef.current;
    const q = queryRef.current;
    if (cId && q.trim()) {
      // Don't run a query that still has unbound $param_x tokens — the literal
      // token would surface a raw `syntax error at or near "$"` in the editor
      // preview. Mirror the dashboard's "Waiting for parameters…" state by
      // skipping the run (#1055).
      if (!allReferencedParamsReady(q, allParamValuesRef.current)) return;
      const referenced = extractReferencedParams(q, allParamValuesRef.current);
      const params =
        Object.keys(referenced).length > 0 ? referenced : undefined;
      const connectorType = selectedConnectionRef.current?.type ?? "neo4j";
      const input = {
        connectionId: cId,
        query: wrapWithPreviewLimit(q, connectorType),
        params,
      };
      const key = JSON.stringify(input);
      if (auto && key === lastRunRef.current) return;
      lastRunRef.current = key;
      previewQueryRef.current.mutate(input);
    }
  }, []);

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
    const timer = setTimeout(() => {
      runPreview(true);
    }, 800);
    return () => clearTimeout(timer);
  }, [open, query, connectionId, runPreview]);

  // CMD+Shift+Enter: run query, then save on success.
  const handleRunAndSave = useCallback(() => {
    if (chartType === "markdown" || chartType === "iframe") return;
    if (!query.trim() || saveStatus === "saving") return;
    setSaveStatus("saving");
    previewQueryRef.current.mutate(
      { connectionId, query },
      {
        onSuccess: () => {
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
        onError: () => {
          setSaveStatus("idle");
        },
      },
    );
  }, [
    query,
    saveStatus,
    connectionId,
    chartType,
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
