"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { SsoClaimMapping, UserRole } from "@/lib/db/schema";

export interface SsoProviderListItem {
  id: string;
  name: string;
  protocol: string;
  issuer: string;
  clientId: string;
  scopes: string;
  claimMappings: SsoClaimMapping | null;
  autoProvision: boolean;
  defaultRole: UserRole;
  enforceSso: boolean;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CreateSsoProviderInput {
  name: string;
  issuer: string;
  clientId: string;
  clientSecret: string;
  scopes?: string;
  claimMappings?: SsoClaimMapping;
  autoProvision?: boolean;
  defaultRole?: UserRole;
  enforceSso?: boolean;
}

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init);
  const body = await res.json();
  if (!res.ok) {
    throw new Error(
      body?.error?.message ?? body?.error ?? "Request failed: " + res.status,
    );
  }
  return (body?.data === undefined ? body : body.data) as T;
}

export function useSsoProviders() {
  return useQuery<SsoProviderListItem[]>({
    queryKey: ["sso-providers"],
    queryFn: () => fetchJson<SsoProviderListItem[]>("/api/sso-providers"),
  });
}

export function useCreateSsoProvider() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: CreateSsoProviderInput) =>
      fetchJson<SsoProviderListItem>("/api/sso-providers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["sso-providers"] });
    },
  });
}

export function useDeleteSsoProvider() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) =>
      fetchJson<{ id: string }>(
        "/api/sso-providers?id=" + encodeURIComponent(id),
        { method: "DELETE" },
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["sso-providers"] });
    },
  });
}
