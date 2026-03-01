"use client";

import { useMutation } from "@tanstack/react-query";

interface WriteQueryInput {
  connectionId: string;
  query: string;
  params?: Record<string, unknown>;
}

interface WriteQueryResult {
  success: boolean;
  data: unknown;
  serverDurationMs: number;
}

export function useWriteQueryExecution() {
  return useMutation<WriteQueryResult, Error, WriteQueryInput>({
    mutationFn: async (input) => {
      const res = await fetch("/api/query/write", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || "Write query execution failed");
      }
      return res.json();
    },
  });
}
