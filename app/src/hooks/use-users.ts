"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { unwrapResponse } from "@/lib/api-client";
import type { UserRole } from "@/lib/db/schema";

export interface UserListItem {
  id: string;
  name: string | null;
  email: string | null;
  role: UserRole;
  canWrite: boolean;
  createdAt: string;
}

export interface CreateUserInput {
  name: string;
  email: string;
  password: string;
  role?: UserRole;
  canWrite?: boolean;
}

export function useUsers() {
  return useQuery<UserListItem[]>({
    queryKey: ["users"],
    queryFn: async () => {
      const res = await fetch("/api/users");
      return unwrapResponse<UserListItem[]>(res);
    },
    // Don't retry permission errors — retrying a 403 won't help.
    retry: (_count, error) =>
      !(error instanceof Error && error.message === "Forbidden"),
  });
}

export function useCreateUser() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: CreateUserInput) => {
      const res = await fetch("/api/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      });
      return unwrapResponse<UserListItem>(res);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["users"] });
    },
  });
}

export function useUpdateUserRole() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, role }: { id: string; role: UserRole }) => {
      const res = await fetch(`/api/users/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role }),
      });
      return unwrapResponse(res);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["users"] });
    },
  });
}

export function useUpdateUserCanWrite() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, canWrite }: { id: string; canWrite: boolean }) => {
      const res = await fetch(`/api/users/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ canWrite }),
      });
      return unwrapResponse(res);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["users"] });
    },
  });
}

export function useDeleteUser() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/users/${id}`, { method: "DELETE" });
      return unwrapResponse(res);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["users"] });
    },
  });
}
