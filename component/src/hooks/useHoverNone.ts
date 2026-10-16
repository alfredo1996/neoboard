import { useSyncExternalStore } from "react";

const QUERY = "(hover: none)";

function subscribe(onChange: () => void) {
  const mql = globalThis.matchMedia?.(QUERY);
  mql?.addEventListener("change", onChange);
  return () => mql?.removeEventListener("change", onChange);
}

function getSnapshot() {
  return globalThis.matchMedia?.(QUERY).matches ?? false;
}

/**
 * True on a device whose primary input cannot hover (a touch screen). The
 * server and the first client render say false, so a hover-capable screen
 * never flashes the touch layout.
 */
export function useHoverNone(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, () => false);
}
