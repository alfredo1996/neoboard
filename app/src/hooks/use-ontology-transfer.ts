"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { unwrapResponse } from "@/lib/api/api-client";
import type { ImportPreview } from "@/lib/ontology/import-export";

export interface OntologyImportResult {
  applied: boolean;
  preview: ImportPreview;
}

/** Previews an ontology import, or with `apply` writes it. */
export function useImportOntology() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      payload: unknown;
      connectionMapping: Record<string, string>;
      apply: boolean;
    }) =>
      unwrapResponse<OntologyImportResult>(
        await fetch("/api/ontology/import", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(input),
        }),
      ),
    onSuccess: (data) => {
      if (!data.applied) return;
      return Promise.all([
        queryClient.invalidateQueries({ queryKey: ["ontology"] }),
        queryClient.invalidateQueries({ queryKey: ["ontology-concepts"] }),
      ]);
    },
  });
}
