"use client";

import { useMutation } from "@tanstack/react-query";
import { unwrapFullResponse } from "@/lib/api-client";

interface WriteQueryInput {
  connectionId: string;
  query: string;
  params?: Record<string, unknown>;
}

interface WriteQueryResult {
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
      const { data, meta } = await unwrapFullResponse(res);
      return {
        data,
        ...((meta as Record<string, unknown>) ?? {}),
      } as WriteQueryResult;
    },
  });
}
