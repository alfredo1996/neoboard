"use client";

import { useMemo } from "react";
import { useParams } from "next/navigation";
import { useDashboardStore } from "@/stores/dashboard-store";
import {
  savedQueryText,
  type SavedQueryRef,
} from "@/lib/query/saved-query-ref";

/**
 * The reference that stands for a widget's query (#2477), or undefined when
 * the query must travel as text: outside a dashboard page, or when the widget
 * is not saved as it runs. Saved means the stored layout holds the widget on
 * the same connection and database with the same query text; another widget's
 * unsaved edit does not matter. `current.query` is the text being run: the
 * widget's query, or with `seed` the seed's text.
 */
export function useSavedQueryRef(
  widgetId: string | undefined,
  current: { connectionId?: string; database?: string; query?: string },
  seed?: SavedQueryRef["seed"],
): SavedQueryRef | undefined {
  // Dashboards render under /[id] and /[id]/edit; null outside the app router.
  const dashboardId = useParams<{ id?: string }>()?.id;
  const { connectionId, database, query } = current;
  const fieldId = seed?.fieldId;
  const isSeed = !!seed;
  const saved = useDashboardStore((s) => {
    if (!widgetId || !query) return false;
    const w = s.savedLayout?.pages
      .flatMap((p) => p.widgets)
      .find((x) => x.id === widgetId);
    return (
      !!w &&
      w.connectionId === connectionId &&
      (w.database || undefined) === (database || undefined) &&
      savedQueryText(w, isSeed ? { fieldId } : undefined) === query
    );
  });
  return useMemo(
    () =>
      saved && dashboardId && widgetId
        ? { dashboardId, widgetId, ...(isSeed ? { seed: { fieldId } } : {}) }
        : undefined,
    [saved, dashboardId, widgetId, isSeed, fieldId],
  );
}
