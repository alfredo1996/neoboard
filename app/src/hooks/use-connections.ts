"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

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
      if (!res.ok) throw new Error("Failed to fetch connections");
      return res.json();
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
      if (!res.ok) throw new Error("Failed to create connection");
      return res.json();
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
      if (!res.ok) throw new Error("Failed to delete connection");
      return res.json();
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
      return res.json() as Promise<{ success: boolean; error?: string }>;
    },
  });
}
