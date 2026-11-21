"use client";

import { useCallback, useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@neoboard/components";
import { clearRefresh, markRefresh, peekRefresh } from "@/hooks/refresh-flag";
import { unwrapResponse } from "@/lib/api/api-client";
import type { OntologyTerm } from "@/lib/ontology/merge";

interface OntologyResponse {
  terms: OntologyTerm[];
}

/** What a creator says about one term. */
export type TermMeaning = Pick<OntologyTerm, "kind" | "key" | "parentKey"> &
  Partial<Pick<OntologyTerm, "displayName" | "description" | "hidden">> & {
    /** Deletes the stored meaning; how an orphaned term goes. */
    remove?: boolean;
  };

const ontologyKey = (connectionId: string) => ["ontology", connectionId];

/**
 * A connection's terms (#2415): the structure its connector reports with the
 * saved meaning laid over it. Every read introspects the connection, so it is
 * cached for five minutes; `useRefreshOntology` is the Model page's refresh.
 */
export function useOntology(connectionId: string) {
  return useQuery<OntologyResponse>({
    enabled: connectionId !== "",
    queryKey: ontologyKey(connectionId),
    queryFn: async ({ signal }) => {
      const flag = `ontology:${connectionId}`;
      const data = await unwrapResponse<OntologyResponse>(
        await fetch(
          `/api/connections/${connectionId}/ontology${peekRefresh(flag)}`,
          { signal },
        ),
      );
      clearRefresh(flag);
      return data;
    },
    staleTime: 5 * 60 * 1000,
    retry: 1,
  });
}

/**
 * The Model page's Refresh: reads the database again, past the server's cache
 * (#2514). Stable across renders. A plain `refetch` ("Try again") is an
 * ordinary read.
 */
export function useRefreshOntology(connectionId: string) {
  const queryClient = useQueryClient();
  return useCallback(() => {
    const queryKey = ontologyKey(connectionId);
    markRefresh(queryClient, queryKey, `ontology:${connectionId}`);
    return queryClient.invalidateQueries({ queryKey });
  }, [queryClient, connectionId]);
}

/**
 * What the query editor needs of a connection's terms (#2415): the live terms a
 * creator described or hid. Undefined until they are read, and when they cannot
 * be: autocomplete simply goes without.
 */
export function useEditorTerms(connectionId: string) {
  const { data } = useOntology(connectionId);
  return useMemo(
    () =>
      data?.terms.filter(
        (t) => !t.orphaned && (t.hidden || t.displayName || t.description),
      ),
    [data],
  );
}

/**
 * Saves the meaning of one or more terms, only the fields given; the answer
 * replaces the cache. A failure is told here, in the mutation's options: a
 * callback passed to `mutate` fires for the latest call only, so a second quick
 * save would swallow the first one's error.
 */
export function useSaveTerms(connectionId: string) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
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
    onError: (e) =>
      toast({
        title: "Could not save",
        description: e instanceof Error ? e.message : "Something went wrong.",
        variant: "destructive",
      }),
  });
}
