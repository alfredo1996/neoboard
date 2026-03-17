import { create } from "zustand";
import type { DatabaseSchema } from "@/lib/schema-types";

interface SchemaState {
  schemas: Record<string, DatabaseSchema>; // connectionId → schema
  setSchema: (connectionId: string, schema: DatabaseSchema) => void;
  getSchema: (connectionId: string) => DatabaseSchema | undefined;
  clearSchema: (connectionId: string) => void;
}

export const useSchemaStore = create<SchemaState>((set, get) => ({
  schemas: {},

  setSchema: (connectionId, schema) =>
    set((state) => ({
      schemas: { ...state.schemas, [connectionId]: schema },
    })),

  getSchema: (connectionId) => get().schemas[connectionId],

  clearSchema: (connectionId) =>
    set((state) => {
      const next = { ...state.schemas };
      delete next[connectionId];
      return { schemas: next };
    }),
}));
