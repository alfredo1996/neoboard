"use client";

import { limitedFetch } from "@/lib/query/limited-fetch";
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
  /** Server-side hash of what was asked; the same query keeps it across runs. */
  resultId: string;
  /** The connector that ran the query (#2061). */
  connectorType?: string;
  /** Server-side execution time in ms (#2435). */
  serverDurationMs?: number;
  /** Part of it spent waiting in the connection's queue (#2438). */
  schedulerWaitMs?: number;
}

export function useQueryExecution() {
  return useMutation<QueryResult, Error, QueryInput>({
    mutationFn: async (input) => {
      const res = await limitedFetch("/api/query", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      });
      const { data, meta } = await unwrapFullResponse<{ data: unknown }>(res);
      return { ...data, ...meta } as QueryResult;
    },
  });
}
