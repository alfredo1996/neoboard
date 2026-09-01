import { describe, it, expect, beforeEach } from "vitest";
import { useConnectionStatusStore } from "../connection-status-store";

/**
 * #1544 — connection status lived only in the connections page's local
 * useState, so a client-side navigation remounted the segment and wiped it.
 * Every visit therefore replayed the whole state machine in front of the user:
 * an unchecked default, then "Connecting…", then the result — ~85ms of badge
 * churn on a page where nothing had actually changed.
 *
 * Status belongs in something that outlives the mount. These are the state
 * transitions that make the badge stop flickering; the page component only
 * wires them up.
 */
describe("connection-status-store (#1544)", () => {
  beforeEach(() => {
    useConnectionStatusStore.getState().reset();
  });

  const store = () => useConnectionStatusStore.getState();

  it("reports an unseen connection as unknown, not disconnected", () => {
    // The whole bug in one assertion: "we have not looked" must not render as
    // a verdict.
    expect(store().getStatus("never-seen")).toBe("unknown");
  });

  it("remembers a status across remounts", () => {
    store().setStatus("a", "connected");
    // A remount reads the same module-level store rather than a fresh useState.
    expect(store().getStatus("a")).toBe("connected");
  });

  it("keeps a known status visible while re-probing in the background", () => {
    store().setStatus("a", "connected");
    store().beginBackgroundProbe("a");
    expect(store().getStatus("a")).toBe("connected");
  });

  it("shows connecting for a background probe of an unchecked connection", () => {
    store().beginBackgroundProbe("fresh");
    expect(store().getStatus("fresh")).toBe("connecting");
  });

  // The three user-initiated call sites (manual Test, post-create, post-edit)
  // must still show progress — the user just asked for it there.
  it("shows connecting when a probe is explicitly user-initiated", () => {
    store().setStatus("a", "connected");
    store().setStatus("a", "connecting");
    expect(store().getStatus("a")).toBe("connecting");
  });

  it("stores and clears an error message alongside the status", () => {
    store().setStatus("a", "error", "auth failed");
    expect(store().getError("a")).toBe("auth failed");

    store().setStatus("a", "connected");
    expect(store().getError("a")).toBeUndefined();
  });

  it("forgets a connection that no longer exists", () => {
    store().setStatus("gone", "connected");
    store().forget("gone");
    expect(store().getStatus("gone")).toBe("unknown");
  });

  it("keeps statuses independent per connection", () => {
    store().setStatus("a", "connected");
    store().setStatus("b", "error", "nope");
    expect(store().getStatus("a")).toBe("connected");
    expect(store().getStatus("b")).toBe("error");
    expect(store().getError("a")).toBeUndefined();
  });
});
