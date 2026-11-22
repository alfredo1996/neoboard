"use client";

import { useCallback, useMemo, useRef } from "react";
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

/** `edit` laid over `term`, as the server would store it. */
function applyMeaning(term: OntologyTerm, edit: TermMeaning): OntologyTerm {
  if (edit.remove) {
    return { ...term, displayName: "", description: "", hidden: false };
  }
  return {
    ...term,
    ...(edit.displayName !== undefined && { displayName: edit.displayName }),
    ...(edit.description !== undefined && { description: edit.description }),
    ...(edit.hidden !== undefined && { hidden: edit.hidden }),
  };
}

const FIELDS = ["displayName", "description", "hidden"] as const;
const fieldKey = (t: TermMeaning, f: string) =>
  JSON.stringify([t.kind, t.key, t.parentKey, f]);
const fieldsOf = (edit: TermMeaning) =>
  edit.remove ? FIELDS : FIELDS.filter((f) => edit[f] !== undefined);

/**
 * Saves the meaning of one or more terms, only the fields given. The edit shows
 * in the cache at once and the answer is not written back: each PUT answers
 * with the whole list as it stood then, so two saves that land out of order
 * would let the older answer put back what the newer one changed (#2534). The
 * terms are read again when the last pending save settles. A failed save puts
 * back the values it replaced, except a field a later save has changed since
 * (that edit stands), so a refetch that fails too does not leave the rejected
 * value on screen. A failure is told here, in the mutation's options: a
 * callback passed to `mutate` fires for the latest call only, so a second
 * quick save would swallow the first one's error.
 */
export function useSaveTerms(connectionId: string) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const queryKey = ontologyKey(connectionId);
  const mutationKey = ["ontology-save", connectionId];
  // Which save last changed each term field, so a rollback spares a later edit.
  const lastWriter = useRef(new Map<string, number>());
  const saves = useRef(0);
  return useMutation({
    mutationKey,
    onMutate: async (edits: TermMeaning[]) => {
      await queryClient.cancelQueries({ queryKey });
      const save = ++saves.current;
      const previous: Array<{ edit: TermMeaning; term: OntologyTerm }> = [];
      queryClient.setQueryData<OntologyResponse>(
        queryKey,
        (old) =>
          old && {
            terms: old.terms.map((t) => {
              const edit = edits.find(
                (e) =>
                  e.kind === t.kind &&
                  e.key === t.key &&
                  e.parentKey === t.parentKey,
              );
              if (!edit) return t;
              previous.push({ edit, term: t });
              return applyMeaning(t, edit);
            }),
          },
      );
      for (const { edit } of previous) {
        for (const f of fieldsOf(edit)) {
          lastWriter.current.set(fieldKey(edit, f), save);
        }
      }
      return { save, previous };
    },
    onSettled: () => {
      // This save still counts as mutating, so 1 means it was the last.
      if (queryClient.isMutating({ mutationKey }) === 1) {
        return queryClient.invalidateQueries({ queryKey });
      }
    },
    mutationFn: async (terms: TermMeaning[]) =>
      unwrapResponse<OntologyResponse>(
        await fetch(`/api/connections/${connectionId}/ontology`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ terms }),
        }),
      ),
    onError: (e, _edits, context) => {
      if (context) {
        const { save, previous } = context;
        queryClient.setQueryData<OntologyResponse>(
          queryKey,
          (old) =>
            old && {
              terms: old.terms.map((t) => {
                const was = previous.find(
                  (p) =>
                    p.term.kind === t.kind &&
                    p.term.key === t.key &&
                    p.term.parentKey === t.parentKey,
                );
                if (!was) return t;
                const back: Partial<OntologyTerm> = {};
                for (const f of fieldsOf(was.edit)) {
                  const k = fieldKey(was.edit, f);
                  if (lastWriter.current.get(k) !== save) continue;
                  // Free again: an earlier pending save may now restore it.
                  lastWriter.current.delete(k);
                  Object.assign(back, { [f]: was.term[f] });
                }
                return { ...t, ...back };
              }),
            },
        );
      }
      toast({
        title: "Could not save",
        description: e instanceof Error ? e.message : "Something went wrong.",
        variant: "destructive",
      });
    },
  });
}
