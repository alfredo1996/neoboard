"use client";

import { createContext, useContext } from "react";

/**
 * Connection names by id, for the widgets that say where they write (#2232).
 * The dashboard container provides what the server resolved for the viewer;
 * outside it (the widget editor's preview) no name is known.
 */
const ConnectionNamesContext = createContext<
  Record<string, string> | undefined
>(undefined);

export const ConnectionNamesProvider = ConnectionNamesContext.Provider;

export function useConnectionName(connectionId: string): string | undefined {
  return useContext(ConnectionNamesContext)?.[connectionId];
}
