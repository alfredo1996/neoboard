"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { unwrapResponse } from "@/lib/api/api-client";
import { SaveError } from "@/lib/dashboard/save-error";
import type { DashboardLayout, DashboardLayoutV2 } from "@/lib/db/schema";

export interface ImportDashboardInput {
  payload: unknown;
  connectionMapping: Record<string, string>;
  /**
   * Connection placeholder keys the user explicitly chose to skip. Widgets
   * referencing a skipped key are imported with `connectionId=""` and surfaced
   * in the response notes.
   */
  skippedConnections?: string[];
}

/**
 * Import response shape. Existing callers that only read `id` continue to
 * work; new callers can render the notes list (mapping summary, chart-type
 * downgrades, skipped connections, etc.).
 */
export interface ImportDashboardResult extends DashboardDetail {
  notes: string[];
}

export interface WidgetPreviewItem {
  x: number;
  y: number;
  w: number;
  h: number;
  chartType: string;
  /** JPEG data-URI thumbnail captured on last save. */
  thumbnailUrl?: string;
}

export interface DashboardListItem {
  id: string;
  name: string;
  description: string | null;
  isPublic: boolean | null;
  createdAt: string;
  updatedAt: string;
  updatedByName: string | null;
  role: "owner" | "viewer" | "editor" | "admin";
  preview: WidgetPreviewItem[];
  widgetCount: number;
}

export interface DashboardDetail extends DashboardListItem {
  /** Stored as-is from the DB; call migrateLayout() before use. */
  layoutJson: DashboardLayout | null;
  userId: string;
  /** Optimistic lock version — send as `expectedVersion` on PUT. */
  version: number;
}

export interface DashboardShareItem {
  id: string;
  role: "viewer" | "editor";
  createdAt: string;
  userName: string | null;
  userEmail: string | null;
  /** The sharee's global role; an Editor share is a no-op for a reader (#1056). */
  userRole: "admin" | "creator" | "reader";
}

export function useDashboards(limit = 100, offset = 0) {
  return useQuery<DashboardListItem[]>({
    queryKey: ["dashboards", limit, offset],
    queryFn: async () => {
      const res = await fetch(
        `/api/dashboards?limit=${limit}&offset=${offset}`,
      );
      return unwrapResponse<DashboardListItem[]>(res);
    },
  });
}

export function useDashboard(id: string) {
  return useQuery<DashboardDetail>({
    queryKey: ["dashboards", id],
    queryFn: async () => {
      const res = await fetch(`/api/dashboards/${id}`);
      return unwrapResponse<DashboardDetail>(res);
    },
    enabled: !!id,
  });
}

export function useCreateDashboard() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: { name: string; description?: string }) => {
      const res = await fetch("/api/dashboards", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      });
      return unwrapResponse<DashboardDetail>(res);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["dashboards"] });
    },
  });
}

export function useUpdateDashboard() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      id,
      expectedVersion,
      ...data
    }: {
      id: string;
      name?: string;
      description?: string;
      layoutJson?: DashboardLayoutV2;
      isPublic?: boolean;
      /** Optimistic lock — when provided, server returns 409 on mismatch. */
      expectedVersion?: number;
    }) => {
      let res: Response;
      try {
        res = await fetch(`/api/dashboards/${id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...data, expectedVersion }),
        });
      } catch (err) {
        // Network failure — no status available
        throw new SaveError(
          err instanceof Error ? err.message : "Network error",
          0,
        );
      }
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        const msg =
          (body && typeof body.error === "string" && body.error) ||
          (body?.error?.message as string | undefined) ||
          `Request failed (HTTP ${res.status})`;
        throw new SaveError(msg, res.status);
      }
      return unwrapResponse(res);
    },
    onSuccess: (result, variables) => {
      // Update the version-bump baseline in sessionStorage BEFORE invalidating
      // the cache. The dashboard detail page (`[id]/page.tsx`) compares the
      // refetched server version to this stored value to decide whether to
      // show the "Dashboard updated by X" banner. Without this, a successful
      // self-save would always trigger that banner on the user's own next
      // visit (the refetch sees version N+1, sessionStorage still says N →
      // banner fires with the user's own name).
      //
      // TanStack Query guarantees onSuccess runs before invalidateQueries'
      // refetch lands, so the sessionStorage write is in place by the time
      // the detail page's effect reads it.
      if (typeof window !== "undefined") {
        const newVersion = (result as { version?: unknown } | undefined)
          ?.version;
        if (typeof newVersion === "number") {
          sessionStorage.setItem(
            `__nb_dash_ver_${variables.id}`,
            String(newVersion),
          );
        }
      }
      queryClient.invalidateQueries({
        queryKey: ["dashboards", variables.id],
      });
      queryClient.invalidateQueries({ queryKey: ["dashboards"] });
    },
  });
}

/** Fire-and-forget mutation to persist widget thumbnails after a dashboard save. */
export function useUpdateDashboardThumbnails() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      id,
      thumbnailJson,
    }: {
      id: string;
      thumbnailJson: Record<string, string>;
    }) => {
      const res = await fetch(`/api/dashboards/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ thumbnailJson }),
      });
      return unwrapResponse(res);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["dashboards"] });
    },
  });
}

export function useDeleteDashboard() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/dashboards/${id}`, { method: "DELETE" });
      return unwrapResponse(res);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["dashboards"] });
    },
  });
}

export function useDuplicateDashboard() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/dashboards/${id}/duplicate`, {
        method: "POST",
      });
      return unwrapResponse<DashboardDetail>(res);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["dashboards"] });
    },
  });
}

// ── Import hook ──────────────────────────────────────────────────────

export function useImportDashboard() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (body: ImportDashboardInput) => {
      const res = await fetch("/api/dashboards/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      return unwrapResponse<ImportDashboardResult>(res);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["dashboards"] });
    },
  });
}

// ── Assignment / sharing hooks ────────────────────────────────────────

export function useDashboardShares(dashboardId: string) {
  return useQuery<DashboardShareItem[]>({
    queryKey: ["dashboard-shares", dashboardId],
    queryFn: async () => {
      const res = await fetch(`/api/dashboards/${dashboardId}/share`);
      return unwrapResponse<DashboardShareItem[]>(res);
    },
    enabled: !!dashboardId,
  });
}

export function useAssignDashboard(dashboardId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: { email: string; role: "viewer" | "editor" }) => {
      const res = await fetch(`/api/dashboards/${dashboardId}/share`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      });
      return unwrapResponse(res);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["dashboard-shares", dashboardId],
      });
    },
  });
}

export function useRemoveDashboardShare(dashboardId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (shareId: string) => {
      const res = await fetch(
        `/api/dashboards/${dashboardId}/share?shareId=${shareId}`,
        { method: "DELETE" },
      );
      return unwrapResponse(res);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["dashboard-shares", dashboardId],
      });
    },
  });
}
