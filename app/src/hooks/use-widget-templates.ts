"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { WidgetTemplate } from "@/lib/db/schema";

export interface WidgetTemplateFilters {
  chartType?: string;
  connectorType?: string;
}

export function useWidgetTemplates(filters?: WidgetTemplateFilters) {
  const params = new URLSearchParams();
  if (filters?.chartType) params.set("chartType", filters.chartType);
  if (filters?.connectorType) params.set("connectorType", filters.connectorType);
  const qs = params.toString();

  return useQuery<WidgetTemplate[]>({
    queryKey: ["widget-templates", filters],
    queryFn: async () => {
      const url = qs ? `/api/widget-templates?${qs}` : "/api/widget-templates";
      const res = await fetch(url);
      if (!res.ok) throw new Error("Failed to fetch widget templates");
      return res.json();
    },
  });
}

export interface CreateWidgetTemplateInput {
  name: string;
  description?: string;
  tags?: string[];
  chartType: string;
  connectorType: "neo4j" | "postgresql";
  connectionId?: string;
  query?: string;
  params?: Record<string, unknown>;
  settings?: Record<string, unknown>;
  previewImageUrl?: string;
}

export interface UpdateWidgetTemplateInput {
  name?: string;
  description?: string;
  tags?: string[];
  chartType?: string;
  connectorType?: "neo4j" | "postgresql";
  connectionId?: string | null;
  query?: string;
  params?: Record<string, unknown>;
  settings?: Record<string, unknown>;
  previewImageUrl?: string;
}

export function useCreateWidgetTemplate() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: CreateWidgetTemplateInput) => {
      const res = await fetch("/api/widget-templates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error((body as { error?: string }).error ?? "Failed to create template");
      }
      return res.json() as Promise<WidgetTemplate>;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["widget-templates"] });
    },
  });
}

export function useUpdateWidgetTemplate() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, ...input }: UpdateWidgetTemplateInput & { id: string }) => {
      const res = await fetch(`/api/widget-templates/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error((body as { error?: string }).error ?? "Failed to update template");
      }
      return res.json() as Promise<WidgetTemplate>;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["widget-templates"] });
    },
  });
}

export function useDeleteWidgetTemplate() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/widget-templates/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Failed to delete template");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["widget-templates"] });
    },
  });
}
