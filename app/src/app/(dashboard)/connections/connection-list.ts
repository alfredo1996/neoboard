import type { StatusTone } from "@neoboard/components";
import type { ConnectionState } from "@/stores/connection-status-store";

/** "N connections · M shared with the workspace" (the mock's page meta, #2254). */
export function connectionListMeta(total: number, shared: number): string {
  const base = `${total} ${total === 1 ? "connection" : "connections"}`;
  return shared > 0 ? `${base} · ${shared} shared with the workspace` : base;
}

/** How many of the listed connections every user in the tenant can use. */
export function sharedCount(
  list: readonly { visibility: string }[] | undefined,
): number {
  return (list ?? []).filter((c) => c.visibility === "shared").length;
}

/** A status cell's word and tone: a verdict reads "Connected" or "Can't connect". */
export function connectionStatusView(state: ConnectionState): {
  text: string;
  tone: StatusTone;
} {
  switch (state) {
    case "connected":
      return { text: "Connected", tone: "good" };
    case "error":
    case "disconnected":
      return { text: "Can't connect", tone: "failed" };
    case "connecting":
      return { text: "Checking…", tone: "pending" };
    default:
      // Not checked is the absence of a verdict: a hollow shape.
      return { text: "Not checked", tone: "none" };
  }
}
