"use client";

import { limitedFetch } from "@/lib/query/limited-fetch";
import { useMutation } from "@tanstack/react-query";
import { useRef } from "react";
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
  /** Whole server run in ms, queue wait included (#2435). */
  serverDurationMs?: number;
  /** Part of it spent waiting in the connection's queue (#2438). */
  schedulerWaitMs?: number;
}

export function useQueryExecution() {
  // A new run replaces the one before it: the server stops the old query
  // instead of finishing a result nobody will read (#2444).
  const previous = useRef<AbortController | undefined>(undefined);
  return useMutation<QueryResult, Error, QueryInput>({
    mutationFn: async (input) => {
      previous.current?.abort();
      const controller = new AbortController();
      previous.current = controller;
      const res = await limitedFetch("/api/query", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
        signal: controller.signal,
      });
      const { data, meta } = await unwrapFullResponse<{ data: unknown }>(res);
      return { ...data, ...meta } as QueryResult;
    },
  });
}
