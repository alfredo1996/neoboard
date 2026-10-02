import { create } from "zustand";
import type { ConnectionState } from "@neoboard/components";
import {
  ClientQueueTimeoutError,
  ConnectorUnavailableError,
  QueueFullError,
} from "@/lib/api/api-client";
import { hintForConnectionErrorCode } from "@/lib/connector/connection-error-classifier";

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
 * status immediately. Each verdict is dated (`testedAt`): since #2168 the
 * Connections page re-tests one once it is 5 minutes old, and a revisit
 * before then re-tests nothing.
 *
 * Deliberately NOT persisted to storage: a status is only meaningful for as
 * long as the tab has been open. Reading a "connected" badge from last week
 * would be a worse lie than the flicker.
 */
interface ConnectionStatusStore {
  statuses: Record<string, ConnectionState>;
  errors: Record<string, string>;
  /** When each verdict was reached, in ms (#2168). Progress is not dated. */
  testedAt: Record<string, number>;
  /**
   * When the page's own run last tried each connection, verdict or not
   * (#2168): a try the scheduler turned away waits as long as a verdict does.
   */
  attemptedAt: Record<string, number>;
  /**
   * The running "Test all" or arrival run's progress; null when none is.
   * Here, not in the page, because the run outlives a remount (#2168).
   */
  run: { done: number; total: number } | null;
  getStatus: (id: string) => ConnectionState;
  getError: (id: string) => string | undefined;
  /**
   * Record a definite state. Clears any stored error unless one is given.
   * A verdict is dated `at`: now, unless a restored one keeps its own.
   */
  setStatus: (
    id: string,
    status: ConnectionState,
    error?: string,
    at?: number,
  ) => void;
  /**
   * What a dashboard query learned about its connection (#1678).
   *
   * A `ConnectorUnavailableError` flags the connection with the classifier's
   * hint, so every sibling widget paints "Connector unavailable" at once —
   * including the ones gated on a parameter whose seed query is on the same
   * dead connector and will therefore never arrive. Anything else — rows, or
   * a query the database itself rejected — proves the connector answered,
   * and clears a flag this path (or the Connections page) had set. Scheduler
   * backpressure (408/503) is neither: that request never reached the
   * connector, so it is no information at all. It never writes a verdict
   * for a connection nobody has flagged: that is the Connections page's
   * probe to run, not a dashboard's side effect.
   */
  noteQueryOutcome: (id: string, error: unknown) => void;
  noteAttempts: (ids: string[], at?: number) => void;
  setRun: (run: { done: number; total: number } | null) => void;
  /** Drop a connection that no longer exists. */
  forget: (id: string) => void;
  reset: () => void;
}

export const useConnectionStatusStore = create<ConnectionStatusStore>(
  (set, get) => ({
    statuses: {},
    errors: {},
    testedAt: {},
    attemptedAt: {},
    run: null,

    getStatus: (id) => get().statuses[id] ?? "unknown",
    getError: (id) => get().errors[id],

    setStatus: (id, status, error, at = Date.now()) =>
      set((prev) => {
        const errors = { ...prev.errors };
        if (error === undefined) {
          delete errors[id];
        } else {
          errors[id] = error;
        }
        const verdict = status !== "connecting" && status !== "unknown";
        return {
          statuses: { ...prev.statuses, [id]: status },
          errors,
          testedAt: verdict ? { ...prev.testedAt, [id]: at } : prev.testedAt,
        };
      }),

    noteQueryOutcome: (id, error) => {
      if (error instanceof ConnectorUnavailableError) {
        get().setStatus(id, "error", hintForConnectionErrorCode(error.reason));
      } else if (
        error instanceof QueueFullError ||
        error instanceof ClientQueueTimeoutError
      ) {
        return;
      } else if (get().statuses[id] === "error") {
        get().setStatus(id, "connected");
      }
    },

    noteAttempts: (ids, at = Date.now()) =>
      set((prev) => ({
        attemptedAt: {
          ...prev.attemptedAt,
          ...Object.fromEntries(ids.map((id) => [id, at])),
        },
      })),

    setRun: (run) => set({ run }),

    forget: (id) =>
      set((prev) => {
        const statuses = { ...prev.statuses };
        const errors = { ...prev.errors };
        delete statuses[id];
        delete errors[id];
        return { statuses, errors };
      }),

    reset: () =>
      set({
        statuses: {},
        errors: {},
        testedAt: {},
        attemptedAt: {},
        run: null,
      }),
  }),
);

/**
 * Run a `/api/query` unwrap and report its outcome for `connectionId`.
 * Shared by the widget and seed-query hooks so the two never disagree on
 * what counts as a dead connector (#1678).
 */
export async function trackConnectorOutcome<T>(
  connectionId: string,
  unwrap: Promise<T>,
): Promise<T> {
  const { noteQueryOutcome } = useConnectionStatusStore.getState();
  try {
    const value = await unwrap;
    noteQueryOutcome(connectionId, null);
    return value;
  } catch (error) {
    noteQueryOutcome(connectionId, error);
    throw error;
  }
}
