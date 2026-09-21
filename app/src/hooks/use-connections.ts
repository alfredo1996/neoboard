"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { unwrapResponse } from "@/lib/api/api-client";
import type { ConnectorConfig } from "@neoboard/connection";

export interface ConnectionListItem {
  id: string;
  name: string;
  type: string;
  /** When true, widgets can override the connection's default database per-card. */
  allowPerCardDb: boolean;
  /** "shared" connections are queryable by every user in the tenant (#901). */
  visibility: "private" | "shared";
  /** True when the current user owns the connection — gates edit/delete UI. */
  isOwner: boolean;
  createdAt: string;
  updatedAt: string;
}

/**
 * A connection config on the wire: the connector's own bag — its keys are the
 * descriptor's, validated server-side against it (#1901) — plus the app's
 * `maxRows`. No connector option is spelled out in the app.
 */
export type ConnectionConfigInput = ConnectorConfig & { maxRows?: number };

export interface CreateConnectionInput {
  name: string;
  type: string;
  config: ConnectionConfigInput;
}

export interface UseConnectionsOptions {
  limit?: number;
  offset?: number;
  /** Skip the request entirely — e.g. dashboard view mode has no use for it. */
  enabled?: boolean;
}

export function useConnections(options?: UseConnectionsOptions) {
  const { limit = 100, offset = 0, enabled = true } = options ?? {};
  return useQuery<ConnectionListItem[]>({
    queryKey: ["connections", limit, offset],
    queryFn: async () => {
      const res = await fetch(
        `/api/connections?limit=${limit}&offset=${offset}`,
      );
      return unwrapResponse<ConnectionListItem[]>(res);
    },
    enabled,
  });
}

/**
 * One connection's stored config as the server hands it out: the values its
 * connector declares, WITHOUT any secret — what the edit and Duplicate dialogs
 * pre-fill from. Idle without an id.
 *
 * Keyed under `["connections"]` so every save invalidates it, and dropped as
 * soon as nothing renders it (`gcTime: 0`): a dialog must never open on the
 * config the connection had before its last save.
 */
export function useConnectionConfig(id: string | undefined) {
  return useQuery<ConnectorConfig>({
    queryKey: ["connections", "config", id],
    queryFn: async () => {
      const connection = await unwrapResponse<{ config?: ConnectorConfig }>(
        await fetch(`/api/connections/${id}`),
      );
      return connection.config ?? {};
    },
    enabled: id !== undefined,
    gcTime: 0,
  });
}

export function useCreateConnection() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: CreateConnectionInput) => {
      const res = await fetch("/api/connections", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      });
      return unwrapResponse<ConnectionListItem>(res);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["connections"] });
    },
  });
}

/**
 * Usage breakdown for a connection — how many widgets on how many
 * dashboards reference it. Returned by GET /api/connections/{id}/usage
 * and embedded in the 409 response from DELETE when the connection is
 * in use and the caller hasn't passed `?force=true`.
 */
export interface ConnectionUsage {
  widgetCount: number;
  dashboards: Array<{ id: string; name: string; widgetCount: number }>;
}

/**
 * Fetch the usage breakdown for a single connection.
 *
 * The UI uses this to pre-populate the delete confirm dialog so the
 * creator sees the blast radius BEFORE clicking Delete. The hook is
 * disabled when `connectionId` is null/undefined so it only fires
 * when a delete is actually being considered.
 */
export function useConnectionUsage(connectionId: string | null) {
  return useQuery<ConnectionUsage>({
    queryKey: ["connection-usage", connectionId],
    queryFn: async () => {
      const res = await fetch(`/api/connections/${connectionId}/usage`);
      return unwrapResponse<ConnectionUsage>(res);
    },
    enabled: !!connectionId,
    // Usage changes when dashboards are edited. Keep it fresh but short
    // TTL so repeated delete attempts don't show stale counts.
    staleTime: 5_000,
  });
}

export function useDeleteConnection() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, force }: { id: string; force?: boolean }) => {
      const url = force
        ? `/api/connections/${id}?force=true`
        : `/api/connections/${id}`;
      const res = await fetch(url, { method: "DELETE" });
      return unwrapResponse(res);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["connections"] });
      queryClient.invalidateQueries({ queryKey: ["connection-usage"] });
    },
  });
}

export interface ReassignResult {
  dashboardsUpdated: number;
  widgetsReassigned: number;
}

/**
 * Re-assign every widget on the given `fromId` connection to
 * `targetConnectionId`. Target must be the same connector type —
 * the server rejects cross-type reassigns with a 400.
 *
 * Used by the delete-connection dialog as a less-destructive
 * alternative to "Delete anyway" (issue #510).
 */
export function useReassignConnection() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      fromId,
      targetConnectionId,
    }: {
      fromId: string;
      targetConnectionId: string;
    }) => {
      const res = await fetch(`/api/connections/${fromId}/reassign`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ targetConnectionId }),
      });
      return unwrapResponse<ReassignResult>(res);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["connection-usage"] });
      queryClient.invalidateQueries({ queryKey: ["dashboards"] });
    },
  });
}

export interface UpdateConnectionInput {
  id: string;
  name?: string;
  /** Admin-only: toggle tenant-wide sharing (#901). */
  visibility?: "private" | "shared";
  /** Replaces the stored config; a secret left out keeps its stored value. */
  config?: ConnectionConfigInput;
}

export function useUpdateConnection() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, ...body }: UpdateConnectionInput) => {
      const res = await fetch(`/api/connections/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      return unwrapResponse<ConnectionListItem>(res);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["connections"] });
    },
  });
}

export function useTestConnection() {
  return useMutation({
    /**
     * `batch` marks a probe that is one of many ("Test all", #1426): the
     * server schedules it at load priority, behind anyone working on that
     * connection. A single Test sends nothing and runs as interactive.
     */
    mutationFn: async ({ id, batch }: { id: string; batch?: boolean }) => {
      const res = await fetch(`/api/connections/${id}/test`, {
        method: "POST",
        ...(batch ? { headers: { "x-query-priority": "2" } } : {}),
      });
      return unwrapResponse<{ success: boolean; error?: string }>(res);
    },
  });
}

export interface TestInlineInput {
  type: string;
  config: ConnectionConfigInput;
}

export function useTestInlineConnection() {
  return useMutation({
    mutationFn: async (input: TestInlineInput) => {
      const res = await fetch("/api/connections/test-inline", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      });
      return unwrapResponse<{
        success: boolean;
        error?: string;
        code?: "auth_failed" | "network" | "bad_uri" | "unknown";
      }>(res);
    },
  });
}
