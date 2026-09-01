import { create } from "zustand";
import type { ConnectionState } from "@neoboard/components";

/**
 * Live connection-test results, keyed by connection id.
 *
 * #1544: this used to be `useState` inside the connections page. A
 * client-side navigation remounts that segment, so the map was wiped on every
 * visit and the page re-ran the whole state machine in front of the user —
 * an unchecked default, then "Connecting…", then the result. Measured at
 * ~85ms of badge churn per visit, on a page where nothing had changed.
 *
 * A module-level store outlives the mount, so a revisit paints the last known
 * status immediately and revalidates behind it.
 *
 * Deliberately NOT persisted to storage: a status is only meaningful for as
 * long as the tab has been open. Reading a "connected" badge from last week
 * would be a worse lie than the flicker.
 */
interface ConnectionStatusStore {
  statuses: Record<string, ConnectionState>;
  errors: Record<string, string>;
  getStatus: (id: string) => ConnectionState;
  getError: (id: string) => string | undefined;
  /** Record a definite state. Clears any stored error unless one is given. */
  setStatus: (id: string, status: ConnectionState, error?: string) => void;
  /**
   * Start a probe the user did not ask for (the on-mount sweep).
   *
   * Shows "Connecting…" only when nothing is known yet. A connection we have
   * already tested keeps its badge until the new result lands — that is the
   * whole point: revalidate without flickering. User-initiated probes (the
   * manual Test action, post-create, post-edit) call `setStatus` directly,
   * because there the progress state is the feedback the user asked for.
   */
  beginBackgroundProbe: (id: string) => void;
  /** Drop a connection that no longer exists. */
  forget: (id: string) => void;
  reset: () => void;
}

export const useConnectionStatusStore = create<ConnectionStatusStore>(
  (set, get) => ({
    statuses: {},
    errors: {},

    getStatus: (id) => get().statuses[id] ?? "unknown",
    getError: (id) => get().errors[id],

    setStatus: (id, status, error) =>
      set((prev) => {
        const errors = { ...prev.errors };
        if (error === undefined) {
          delete errors[id];
        } else {
          errors[id] = error;
        }
        return { statuses: { ...prev.statuses, [id]: status }, errors };
      }),

    beginBackgroundProbe: (id) =>
      set((prev) => {
        const current = prev.statuses[id];
        if (current && current !== "unknown") return prev;
        return { statuses: { ...prev.statuses, [id]: "connecting" } };
      }),

    forget: (id) =>
      set((prev) => {
        const statuses = { ...prev.statuses };
        const errors = { ...prev.errors };
        delete statuses[id];
        delete errors[id];
        return { statuses, errors };
      }),

    reset: () => set({ statuses: {}, errors: {} }),
  }),
);
