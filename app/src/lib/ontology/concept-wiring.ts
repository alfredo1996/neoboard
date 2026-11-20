import type { Concept, ConceptSide } from "@/hooks/use-concepts";

/** The sides of a concept on one connection that the connection still reports. */
const liveSides = (c: Concept, connectionId: string): ConceptSide[] =>
  c.sides.filter((s) => s.connectionId === connectionId && !s.missing);

/**
 * The concepts for which `field` is the key on `connectionId`: any side of the
 * concept there, so a second side on the same connection counts (#2484). A
 * result column carries no table, so the match is by the key property's name.
 * Only plain parameter names are saved from it (#2415 decision 10).
 */
export function conceptsForField(
  concepts: readonly Concept[],
  connectionId: string,
  field: string,
): Concept[] {
  if (!connectionId || !field) return [];
  return concepts.filter((c) =>
    liveSides(c, connectionId).some((s) => s.keyPropertyKey === field),
  );
}

/**
 * Autocomplete entries for the concepts mapped on `connectionId`: the
 * parameter as a query consumes it (`$param_<name>`) and what it filters.
 */
export function parameterCompletions(
  concepts: readonly Concept[],
  connectionId: string,
): { label: string; detail: string }[] {
  if (!connectionId) return [];
  return concepts.flatMap((c) => {
    const sides = liveSides(c, connectionId);
    if (sides.length === 0) return [];
    const keys = sides.map((s) => `${s.entityKey}.${s.keyPropertyKey}`);
    return [
      {
        label: `$param_${c.parameter}`,
        detail: `${c.name}: filters by ${keys.join(", ")}`,
      },
    ];
  });
}
