"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { unwrapResponse } from "@/lib/api/api-client";
import type { OntologyTerm } from "@/lib/ontology/merge";

interface OntologyResponse {
  terms: OntologyTerm[];
}

/** What a creator says about one term. */
export type TermMeaning = Pick<
  OntologyTerm,
  "kind" | "key" | "parentKey" | "displayName" | "description" | "hidden"
>;

const ontologyKey = (connectionId: string) => ["ontology", connectionId];

/**
 * A connection's terms (#2415): the structure its connector reports with the
 * saved meaning laid over it. Every read introspects the connection, so it is
 * cached for five minutes; `refetch` is the Model page's refresh.
 */
export function useOntology(connectionId: string) {
  return useQuery<OntologyResponse>({
    queryKey: ontologyKey(connectionId),
    queryFn: async ({ signal }) =>
      unwrapResponse<OntologyResponse>(
        await fetch(`/api/connections/${connectionId}/ontology`, { signal }),
      ),
    staleTime: 5 * 60 * 1000,
    retry: 1,
  });
}

/** Saves the meaning of one or more terms; the answer replaces the cache. */
export function useSaveTerms(connectionId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (terms: TermMeaning[]) =>
      unwrapResponse<OntologyResponse>(
        await fetch(`/api/connections/${connectionId}/ontology`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ terms }),
        }),
      ),
    onSuccess: (data) =>
      queryClient.setQueryData(ontologyKey(connectionId), data),
  });
}
