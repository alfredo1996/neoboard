"use client";

import {
  createContext,
  useCallback,
  useLayoutEffect,
  useRef,
  useState,
} from "react";

/**
 * Where a card tells its frame that it is refetching under a new parameter
 * value while still showing its previous result (#2369). The frame draws the
 * line and holds the title, so the news has to travel up. No provider (the
 * fullscreen copy, the editor preview) means nobody is told.
 */
export const CardRefreshContext = createContext<
  ((refreshing: boolean) => void) | undefined
>(undefined);

/**
 * What a frame shows while its card refetches under its old rows: the values
 * of the commit that matches the rows, not the new ones. The card reports in
 * a layout effect, which runs before this one, so `last` still holds the
 * previous commit's values when the report arrives. Returns what to show,
 * whether the card is refreshing, and the callback to give the context.
 */
export function useRefreshHold<T>(current: T) {
  const last = useRef(current);
  useLayoutEffect(() => {
    last.current = current;
  });
  const [held, setHeld] = useState<{ value: T } | null>(null);
  const report = useCallback(
    (refreshing: boolean) =>
      setHeld(refreshing ? { value: last.current } : null),
    [],
  );
  return {
    shown: held ? held.value : current,
    refreshing: held !== null,
    report,
  };
}
