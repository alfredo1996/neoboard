"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { unwrapFullResponse, unwrapResponse } from "@/lib/api/api-client";
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
  /**
   * Widgets that need a connection and don't have one — i.e. a skipped
   * mapping. Content-only widgets (markdown, iframe) are excluded server-side.
   * Returned rather than parsed out of `notes` so the bulk-fix offer and the
   * note the user reads carry the same number by construction (#1377).
   */
  unassignedWidgetCount: number;
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

/** Asked for per page; the server may grant less (its MAX_LIMIT), and the hook steps by what it granted. */
const LIST_PAGE_SIZE = 1000;

async function loadAllDashboards() {
  const page = async (offset: number) =>
    unwrapFullResponse<DashboardListItem[]>(
      await fetch(`/api/dashboards?limit=${LIST_PAGE_SIZE}&offset=${offset}`),
    );
  const first = await page(0);
  const total = Number(first.meta?.total ?? first.data.length);
  const step = Number(first.meta?.limit) || first.data.length;
  const offsets: number[] = [];
  for (let o = step; step > 0 && o < total; o += step) offsets.push(o);
  const rest = await Promise.all(offsets.map(page));
  // An update between page requests shifts later offsets by a row: one row
  // arrives twice (kept once per id) and another is skipped (caught below).
  const rows = [first, ...rest].flatMap((p) => p.data);
  return { rows: [...new Map(rows.map((d) => [d.id, d])).values()], total };
}

/**
 * Every dashboard the user can see, across as many pages as `meta.total` says
 * (#1789). The list page searches and checks duplicate names over this, so a
 * first page alone hid everything past it.
 *
 * ponytail: loads the whole list; fine for a few thousand. Past that, move
 * search and the duplicate-name check to the server and paginate the grid.
 */
export function useDashboards() {
  return useQuery<DashboardListItem[]>({
    queryKey: ["dashboards", "list"],
    queryFn: async () => {
      const load = await loadAllDashboards();
      // Fewer unique rows than the total means a mid-load update skipped one;
      // load once more. ponytail: one retry, the next refetch covers a second race.
      return load.rows.length < load.total
        ? (await loadAllDashboards()).rows
        : load.rows;
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

export function useDeleteDashboard() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string): Promise<{ alreadyDeleted: boolean }> => {
      const res = await fetch(`/api/dashboards/${id}`, { method: "DELETE" });
      // 404: someone else deleted it first. The goal is met, so settle as a
      // success and let onSuccess refresh the stale list (#1750).
      if (res.status === 404) return { alreadyDeleted: true };
      await unwrapResponse(res);
      return { alreadyDeleted: false };
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

export interface ReassignDashboardConnectionInput {
  dashboardId: string;
  /** Empty string targets widgets that have no connection (#1377). */
  fromConnectionId: string;
  targetConnectionId: string;
}

export interface ReassignDashboardConnectionResult {
  dashboardsUpdated: number;
  widgetsReassigned: number;
}

/**
 * Re-point the widgets on ONE dashboard to another connection (#1376), or fill
 * in widgets left without one by an import that skipped a connection (#1377).
 *
 * Distinct from `useReassignConnection`, which is connection-scoped and rewrites
 * every dashboard the caller can edit.
 */
export function useReassignDashboardConnection() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      dashboardId,
      ...body
    }: ReassignDashboardConnectionInput) => {
      const res = await fetch(
        `/api/dashboards/${dashboardId}/reassign-connection`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        },
      );
      return unwrapResponse<ReassignDashboardConnectionResult>(res);
    },
    onSuccess: (_result, { dashboardId }) => {
      // The layout changed, so the cached dashboard detail is stale — and its
      // `version` moved, which the editor uses as an optimistic lock.
      queryClient.invalidateQueries({ queryKey: ["dashboards", dashboardId] });
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
