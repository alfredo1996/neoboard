"use client";

import { useMutation } from "@tanstack/react-query";
import { unwrapFullResponse } from "@/lib/api-client";

interface QueryInput {
  connectionId: string;
  query: string;
  params?: Record<string, unknown>;
}

interface QueryResult {
  data: unknown;
  fields?: unknown;
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
      const { data, meta } = await unwrapFullResponse<{
        data: unknown;
        fields?: unknown;
      }>(res);
      return { ...data, ...meta } as QueryResult;
    },
  });
}
