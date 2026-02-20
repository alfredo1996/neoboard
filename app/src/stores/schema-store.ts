import { create } from "zustand";

// DatabaseSchema is intentionally typed as unknown here since the schema
// type is defined in the connection package and importing it would create
// a cross-package dependency. The hook layer handles the typed form.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type DatabaseSchema = Record<string, any>;

interface SchemaState {
  schemas: Record<string, DatabaseSchema>; // connectionId → schema
  setSchema: (connectionId: string, schema: DatabaseSchema) => void;
  getSchema: (connectionId: string) => DatabaseSchema | undefined;
}

export const useSchemaStore = create<SchemaState>((set, get) => ({
  schemas: {},

  setSchema: (connectionId, schema) =>
    set((state) => ({
      schemas: { ...state.schemas, [connectionId]: schema },
    })),

  getSchema: (connectionId) => get().schemas[connectionId],
}));
