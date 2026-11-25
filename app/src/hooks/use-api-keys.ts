"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { unwrapResponse } from "@/lib/api/api-client";

export interface ApiKeyListItem {
  id: string;
  name: string;
  /** Non-secret display prefix (e.g. "nb_1a2b3c4d"); null for pre-#1038 keys. */
  keyPrefix: string | null;
  lastUsedAt: string | null;
  expiresAt: string | null;
  createdAt: string;
}

export interface CreateApiKeyInput {
  name: string;
  expiresAt?: string;
}

export interface CreatedApiKey {
  id: string;
  name: string;
  keyPrefix: string | null;
  expiresAt: string | null;
  createdAt: string;
  key: string;
}

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init);
  return unwrapResponse<T>(res);
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
    onSuccess: async ({ key: _secret, ...row }) => {
      // The list GET in flight when the key was created can resolve without
      // it, and nothing refetches after (#2569): cancel it, put the server's
      // own row in the list (minus the one-time secret), then refetch.
      await queryClient.cancelQueries({ queryKey: ["api-keys"] });
      queryClient.setQueryData<ApiKeyListItem[]>(["api-keys"], (old = []) => [
        { lastUsedAt: null, ...row },
        ...old,
      ]);
      // Not awaited: the dialog must not wait on the refetch.
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
