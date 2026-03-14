"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

export interface ApiKeyListItem {
  id: string;
  name: string;
  lastUsedAt: string | null;
  expiresAt: string | null;
  createdAt: string;
}

export interface CreateApiKeyInput {
  name: string;
  expiresAt?: string;
}

export interface CreatedApiKey extends ApiKeyListItem {
  key: string;
}

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init);
  const body = await res.json();
  if (!res.ok) {
    throw new Error(body?.error?.message ?? body?.error ?? `Request failed: ${res.status}`);
  }
  // Support envelope format { data, error, meta }
  return (body?.data !== undefined ? body.data : body) as T;
}

export function useApiKeys() {
  return useQuery<ApiKeyListItem[]>({
    queryKey: ["api-keys"],
    queryFn: () => fetchJson<ApiKeyListItem[]>("/api/keys"),
  });
}

export function useCreateApiKey() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: CreateApiKeyInput) =>
      fetchJson<CreatedApiKey>("/api/keys", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["api-keys"] });
    },
  });
}

export function useRevokeApiKey() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) =>
      fetchJson<{ success: boolean }>(`/api/keys/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["api-keys"] });
    },
  });
}
