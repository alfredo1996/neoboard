"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { unwrapResponse } from "@/lib/api-client";
import type { DashboardLayout, DashboardLayoutV2 } from "@/lib/db/schema";

export interface ImportDashboardInput {
  payload: unknown;
  connectionMapping: Record<string, string>;
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
  role: "owner" | "viewer" | "editor" | "admin";
  preview: WidgetPreviewItem[];
  widgetCount: number;
}

export interface DashboardDetail extends DashboardListItem {
  /** Stored as-is from the DB; call migrateLayout() before use. */
  layoutJson: DashboardLayout | null;
  userId: string;
}

export interface DashboardShareItem {
  id: string;
  role: "viewer" | "editor";
  createdAt: string;
  userName: string | null;
  userEmail: string | null;
}

export function useDashboards() {
  return useQuery<DashboardListItem[]>({
    queryKey: ["dashboards"],
    queryFn: async () => {
      const res = await fetch("/api/dashboards");
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
      ...data
    }: {
      id: string;
      name?: string;
      description?: string;
      layoutJson?: DashboardLayoutV2;
      isPublic?: boolean;
    }) => {
      const res = await fetch(`/api/dashboards/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      return unwrapResponse(res);
    },
    onSuccess: (_, variables) => {
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
      return unwrapResponse<DashboardDetail>(res);
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
        { method: "DELETE" }
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
