"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { unwrapResponse } from "@/lib/api-client";

export interface ConnectionListItem {
  id: string;
  name: string;
  type: "neo4j" | "postgresql";
  createdAt: string;
  updatedAt: string;
}

export interface CreateConnectionInput {
  name: string;
  type: "neo4j" | "postgresql";
  config: {
    uri: string;
    username: string;
    password: string;
    database?: string;
  };
}

export function useConnections() {
  return useQuery<ConnectionListItem[]>({
    queryKey: ["connections"],
    queryFn: async () => {
      const res = await fetch("/api/connections");
      return unwrapResponse<ConnectionListItem[]>(res);
    },
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

export function useDeleteConnection() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/connections/${id}`, { method: "DELETE" });
      return unwrapResponse(res);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["connections"] });
    },
  });
}

export interface UpdateConnectionInput {
  id: string;
  name?: string;
  config?: Partial<{
    uri: string;
    username: string;
    password: string;
    database: string;
    connectionTimeout: number;
    queryTimeout: number;
    maxPoolSize: number;
    connectionAcquisitionTimeout: number;
    idleTimeout: number;
    statementTimeout: number;
    sslRejectUnauthorized: boolean;
  }>;
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
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/connections/${id}/test`, {
        method: "POST",
      });
      return unwrapResponse<{ success: boolean; error?: string }>(res);
    },
  });
}

export interface TestInlineInput {
  type: "neo4j" | "postgresql";
  config: {
    uri: string;
    username: string;
    password: string;
    database?: string;
  };
}

export function useTestInlineConnection() {
  return useMutation({
    mutationFn: async (input: TestInlineInput) => {
      const res = await fetch("/api/connections/test-inline", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      });
      return unwrapResponse<{ success: boolean; error?: string }>(res);
    },
  });
}
