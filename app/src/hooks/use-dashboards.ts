"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { DashboardLayout, DashboardLayoutV2 } from "@/lib/db/schema";

export interface WidgetPreviewItem {
  x: number;
  y: number;
  w: number;
  h: number;
  chartType: string;
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
      if (!res.ok) throw new Error("Failed to fetch dashboards");
      return res.json();
    },
  });
}

export function useDashboard(id: string) {
  return useQuery<DashboardDetail>({
    queryKey: ["dashboards", id],
    queryFn: async () => {
      const res = await fetch(`/api/dashboards/${id}`);
      if (!res.ok) throw new Error("Failed to fetch dashboard");
      return res.json();
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
      if (!res.ok) throw new Error("Failed to create dashboard");
      return res.json() as Promise<DashboardDetail>;
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
      if (!res.ok) throw new Error("Failed to update dashboard");
      return res.json();
    },
    onSuccess: (_, variables) => {
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
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/dashboards/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Failed to delete dashboard");
      return res.json();
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
      if (!res.ok) throw new Error("Failed to duplicate dashboard");
      return res.json() as Promise<DashboardDetail>;
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
      if (!res.ok) throw new Error("Failed to fetch shares");
      return res.json();
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
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || "Failed to assign user");
      }
      return res.json();
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
      if (!res.ok) throw new Error("Failed to remove assignment");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["dashboard-shares", dashboardId],
      });
    },
  });
}
