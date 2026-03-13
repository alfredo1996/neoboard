"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { unwrapResponse } from "@/lib/api-client";
import type { WidgetTemplate } from "@/lib/db/schema";

export interface WidgetTemplateFilters {
  chartType?: string;
  connectorType?: string;
}

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init);
  return unwrapResponse<T>(res);
}

export function useWidgetTemplates(filters?: WidgetTemplateFilters) {
  const params = new URLSearchParams();
  if (filters?.chartType) params.set("chartType", filters.chartType);
  if (filters?.connectorType) params.set("connectorType", filters.connectorType);
  const qs = params.toString();

  return useQuery<WidgetTemplate[]>({
    queryKey: ["widget-templates", filters],
    queryFn: () => {
      const url = qs ? `/api/widget-templates?${qs}` : "/api/widget-templates";
      return fetchJson<WidgetTemplate[]>(url);
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
    mutationFn: (input: CreateWidgetTemplateInput) =>
      fetchJson<WidgetTemplate>("/api/widget-templates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["widget-templates"] });
    },
  });
}

export function useUpdateWidgetTemplate() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, ...input }: UpdateWidgetTemplateInput & { id: string }) =>
      fetchJson<WidgetTemplate>(`/api/widget-templates/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["widget-templates"] });
    },
  });
}

export function useDeleteWidgetTemplate() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) =>
      fetchJson<{ success: boolean }>(`/api/widget-templates/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["widget-templates"] });
    },
  });
}
