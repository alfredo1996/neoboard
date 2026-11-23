"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { unwrapResponse } from "@/lib/api/api-client";

// The shapes live in lib/, which must not import from hooks/ (#2534).
export type {
  Concept,
  ConceptInput,
  ConceptSide,
} from "@/lib/ontology/concept-types";
import type { Concept, ConceptInput } from "@/lib/ontology/concept-types";

const KEY = ["ontology-concepts"];
const URL = "/api/ontology/concepts";

/** The concepts the caller can see, each with the sides on their connections. */
export function useConcepts({
  live = true,
  enabled = true,
}: { live?: boolean; enabled?: boolean } = {}) {
  return useQuery<Concept[]>({
    queryKey: live ? KEY : [...KEY, "sides"],
    queryFn: async ({ signal }) =>
      (
        await unwrapResponse<{ concepts: Concept[] }>(
          await fetch(live ? URL : `${URL}?live=0`, { signal }),
        )
      ).concepts,
    retry: 1,
    enabled,
  });
}

/**
 * Creates a concept, or replaces the one with `id`. A failure is thrown to the
 * caller: the dialog shows it where the creator is looking (a duplicate name,
 * a connection they cannot use).
 */
export function useSaveConcept() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...input }: ConceptInput & { id?: string }) =>
      unwrapResponse<Concept>(
        await fetch(id ? `${URL}/${id}` : URL, {
          method: id ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(input),
        }),
      ),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: KEY }),
  });
}

export function useDeleteConcept() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) =>
      unwrapResponse<{ id: string }>(
        await fetch(`${URL}/${id}`, { method: "DELETE" }),
      ),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: KEY }),
  });
}
