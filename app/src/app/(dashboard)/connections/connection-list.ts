import type { ConnectionState } from "@neoboard/components";

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

/** A status cell's words and dot: a verdict reads "Connected" or "Can't connect". */
export function connectionStatusView(state: ConnectionState): {
  text: string;
  dot: string;
} {
  switch (state) {
    case "connected":
      return { text: "Connected", dot: "bg-success" };
    case "error":
    case "disconnected":
      return { text: "Can't connect", dot: "bg-destructive" };
    case "connecting":
      return { text: "Connecting…", dot: "bg-warning animate-pulse" };
    default:
      // Not checked is the absence of a verdict: quiet, no colour.
      return { text: "Not checked", dot: "bg-muted-foreground/40" };
  }
}
