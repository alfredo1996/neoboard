"use client";

import { createContext, useContext } from "react";

/**
 * Whether the viewer may expand graph nodes of a widget on a connection
 * (#1828). Expanding runs a fixed neighbour query that no dashboard saves, so
 * the server accepts it only from someone who can edit the dashboard or use
 * the connection directly (#972). The dashboard says who may; outside it (the
 * widget editor's preview) the author is previewing, so the default is yes.
 */
const GraphExpansionAccessContext = createContext<
  (connectionId: string) => boolean
>(() => true);

export const GraphExpansionAccessProvider =
  GraphExpansionAccessContext.Provider;

export function useCanExpandGraph(connectionId: string): boolean {
  return useContext(GraphExpansionAccessContext)(connectionId);
}
