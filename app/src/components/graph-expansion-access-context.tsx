"use client";

import { createContext, useContext } from "react";

/**
 * Whether the viewer may expand graph nodes (#1828). Expanding runs a fixed
 * neighbour query that no dashboard saves, so a view-level viewer is always
 * refused (#972). The dashboard says who may; outside it (the widget editor's
 * preview) the author is previewing, so the default is yes.
 */
const GraphExpansionAccessContext = createContext(true);

export const GraphExpansionAccessProvider =
  GraphExpansionAccessContext.Provider;

export function useCanExpandGraphs(): boolean {
  return useContext(GraphExpansionAccessContext);
}
