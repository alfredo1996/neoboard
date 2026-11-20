"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { unwrapResponse } from "@/lib/api/api-client";

/** One side of a concept: an entity and its key property on a connection. */
export interface ConceptSide {
  connectionId: string;
  entityKey: string;
  keyPropertyKey: string;
  /** What the connection no longer reports; read only. */
  missing?: "entity" | "keyProperty" | null;
}

export interface Concept {
  id: string;
  name: string;
  parameter: string;
  description: string;
  sides: ConceptSide[];
}

export type ConceptInput = Pick<
  Concept,
  "name" | "parameter" | "description"
> & { sides: Omit<ConceptSide, "missing">[] };

const KEY = ["ontology-concepts"];
const URL = "/api/ontology/concepts";

/** The concepts the caller can see, each with the sides on their connections. */
export function useConcepts({ live = true }: { live?: boolean } = {}) {
  return useQuery<Concept[]>({
    queryKey: live ? KEY : [...KEY, "sides"],
    queryFn: async ({ signal }) =>
      (
        await unwrapResponse<{ concepts: Concept[] }>(
          await fetch(live ? URL : `${URL}?live=0`, { signal }),
        )
      ).concepts,
    retry: 1,
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
