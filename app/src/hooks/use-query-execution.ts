"use client";

import { useMutation } from "@tanstack/react-query";

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
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || "Query execution failed");
      }
      return res.json();
    },
  });
}
