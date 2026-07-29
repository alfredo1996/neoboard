/**
 * Live-slot budget for WebGL-backed widgets (#1367).
 *
 * Browsers allow only ~16 simultaneous WebGL contexts and each NVL graph holds
 * one, so a graph-dense dashboard can evict older contexts and leave dead
 * canvases ("Too many active WebGL contexts", #1052). The old fix unmounted
 * every off-screen graph unconditionally, which made *every* scroll pay a
 * teardown/rebuild — and NVL's force layout restarts from scratch, so the graph
 * visibly reshuffled. This registry makes the unmount conditional on real
 * pressure instead: under the budget nothing is evicted.
 *
 * 8 leaves half the ~16 hard cap as headroom for the other canvas widgets a
 * dashboard may hold at the same time (Leaflet maps) plus whatever the browser
 * itself is using, so the budget can be spent in full without approaching the
 * ceiling.
 */
export const WEBGL_WIDGET_BUDGET = 8;

export interface BudgetSlot {
  /** Kept current by the owner's IntersectionObserver. */
  onScreen: boolean;
  /** Release the slot's WebGL context (unmount the widget). */
  evict: () => void;
}

/**
 * The one piece of state: every currently-mounted slot.
 *
 * A `Set` earns its keep three times over here:
 *  - insertion order is preserved, so iterating gives oldest-first eviction
 *    with no timestamps to record or sort;
 *  - `add` on an existing member is a no-op that keeps the member's original
 *    position, so a StrictMode double-claim can neither double-count a slot nor
 *    move it to the back of the eviction queue;
 *  - deleting the current element while iterating is well-defined, so the
 *    eviction loop mutates the live set directly instead of a snapshot.
 *
 * No `typeof window` guard is needed: every writer below is reachable only from
 * a React effect or an IntersectionObserver callback, neither of which runs
 * during SSR, so the set stays empty on the server.
 */
const live = new Set<BudgetSlot>();

export function claimSlot(slot: BudgetSlot): void {
  live.add(slot);
}

export function dropSlot(slot: BudgetSlot): void {
  live.delete(slot);
}

/**
 * Evict the minimum number of off-screen slots needed to get back to budget,
 * oldest first.
 *
 * Deliberately not "evict everything off-screen": going 8 → 9 would tear down
 * up to 8 graphs to make room for 1, which is #1367 in its worst form.
 *
 * ponytail: when more than WEBGL_WIDGET_BUDGET slots are on screen at once
 * (a very large monitor), the budget loses and nothing is evicted — an
 * on-screen eviction would leave a permanent skeleton in front of a user who
 * is looking at it, and would thrash, since the slot is still intersecting and
 * its observer will not fire again. Ceiling: the live count can reach the
 * number of simultaneously-visible graphs. If a dashboard ever gets near the
 * ~16 context cap that way, add a second HARD_CAP constant and let it override
 * the on-screen check.
 */
export function evictOverBudget(): void {
  let over = live.size - WEBGL_WIDGET_BUDGET;
  if (over <= 0) return;
  for (const slot of live) {
    if (over <= 0) break;
    if (slot.onScreen) continue;
    // Delete before evicting: `evict` unmounts via setState, and React decides
    // when to flush that. Removing the slot first keeps `live.size` honest for
    // the rest of this loop. The owner's effect cleanup will call `dropSlot`
    // whenever the flush lands, which is then a harmless no-op.
    live.delete(slot);
    slot.evict();
    over--;
  }
}

export function liveSlotCount(): number {
  return live.size;
}

/** Test isolation only — drop every slot without evicting. */
export function resetSlotRegistry(): void {
  live.clear();
}
