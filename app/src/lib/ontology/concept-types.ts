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
