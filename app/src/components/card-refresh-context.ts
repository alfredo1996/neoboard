"use client";

import { createContext } from "react";

/**
 * Where a card tells its frame that it is refetching under a new parameter
 * value while still showing its previous result (#2369). The frame draws the
 * line and holds the title, so the news has to travel up. No provider (the
 * fullscreen copy, the editor preview) means nobody is told.
 */
export const CardRefreshContext = createContext<
  ((refreshing: boolean) => void) | undefined
>(undefined);
