import { describe, it, expect } from "vitest";
import { connectionsToProbe } from "../connections-to-probe";

/**
 * #1545 — a healthy connection shared with you always showed a red Error
 * badge.
 *
 * The list route returns tenant-shared connections flagged `isOwner: false`,
 * and the connections page's on-mount sweep tested all of them un-gated. But
 * `/api/connections/[id]/test` filters on `eq(connections.userId, userId)` and
 * 404s, so the error envelope made `unwrapResponse` throw and the page painted
 * "Connection test failed" over a connection that was fine.
 *
 * The page already knew the right rule — it gates the manual Test action on
 * `c.isOwner || isAdmin`. The sweep just never applied it.
 */
describe("connectionsToProbe (#1545)", () => {
  const own = { id: "own", isOwner: true };
  const shared = { id: "shared", isOwner: false };

  it("skips connections the user does not own", () => {
    expect(connectionsToProbe([own, shared], false)).toEqual([own]);
  });

  it("probes everything for an admin, who can reach any connection", () => {
    expect(connectionsToProbe([own, shared], true)).toEqual([own, shared]);
  });

  it("treats a missing isOwner as not owned", () => {
    // The flag is optional on the wire; absent must not mean "probe it".
    const noFlag: { id: string; isOwner?: boolean } = { id: "x" };
    expect(connectionsToProbe([noFlag], false)).toEqual([]);
  });

  it("returns an empty list unchanged", () => {
    expect(connectionsToProbe([], false)).toEqual([]);
  });
});
