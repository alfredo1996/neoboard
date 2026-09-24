"use client";

import { useMutation } from "@tanstack/react-query";
import { unwrapFullResponse } from "@/lib/api/api-client";

interface QueryInput {
  connectionId: string;
  query: string;
  params?: Record<string, unknown>;
  /** Per-card database override. */
  database?: string;
  /** Lowers the row cap for this run. The server never lets it raise one. */
  rowLimit?: number;
}

interface QueryResult {
  data: unknown;
  /** Unique ID for this execution, generated server-side. */
  resultId: string;
}

export function useQueryExecution() {
  return useMutation<QueryResult, Error, QueryInput>({
    mutationFn: async (input) => {
      const res = await fetch("/api/query", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      });
      const { data, meta } = await unwrapFullResponse<{ data: unknown }>(res);
      return { ...data, ...meta } as QueryResult;
    },
  });
}
