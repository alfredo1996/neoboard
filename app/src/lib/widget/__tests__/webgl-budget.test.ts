import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  WEBGL_WIDGET_BUDGET as BUDGET,
  claimSlot,
  dropSlot,
  evictOverBudget,
  liveSlotCount,
  resetSlotRegistry,
  type BudgetSlot,
} from "../webgl-budget";

function makeSlot(onScreen = true): BudgetSlot {
  return { onScreen, evict: vi.fn() };
}

/** Claim `n` fresh slots in order; index 0 is the oldest. */
function claimMany(n: number): BudgetSlot[] {
  const slots = Array.from({ length: n }, () => makeSlot());
  for (const slot of slots) claimSlot(slot);
  return slots;
}

beforeEach(() => {
  resetSlotRegistry();
});

describe("webgl budget registry", () => {
  it("evicts nothing at the budget, even with an off-screen slot", () => {
    const slots = claimMany(BUDGET);
    slots[0].onScreen = false;

    evictOverBudget();

    expect(slots.every((s) => !vi.mocked(s.evict).mock.calls.length)).toBe(
      true,
    );
    expect(liveSlotCount()).toBe(BUDGET);
  });

  it("evicts the single off-screen slot once over budget", () => {
    const slots = claimMany(BUDGET + 1);
    slots[0].onScreen = false;

    evictOverBudget();

    expect(slots[0].evict).toHaveBeenCalledTimes(1);
    for (const slot of slots.slice(1))
      expect(slot.evict).not.toHaveBeenCalled();
    expect(liveSlotCount()).toBe(BUDGET);
  });

  it("evicts nothing over budget while every slot is on screen", () => {
    // A large monitor showing more graphs than the budget: the render wins.
    // Evicting would drop a skeleton in front of a user who is looking at it.
    const slots = claimMany(BUDGET + 1);

    evictOverBudget();

    for (const slot of slots) expect(slot.evict).not.toHaveBeenCalled();
    expect(liveSlotCount()).toBe(BUDGET + 1);
  });

  it("evicts the minimum — oldest off-screen only, not every off-screen slot", () => {
    const slots = claimMany(BUDGET + 1);
    slots[0].onScreen = false;
    slots[1].onScreen = false;

    evictOverBudget();

    expect(slots[0].evict).toHaveBeenCalledTimes(1);
    expect(slots[1].evict).not.toHaveBeenCalled();
    expect(liveSlotCount()).toBe(BUDGET);
  });

  it("drops slots without leaking, and ignores unknown slots", () => {
    const slots = claimMany(3);

    dropSlot(slots[1]);
    expect(liveSlotCount()).toBe(2);

    // Re-claiming a dropped slot restores exactly one entry.
    claimSlot(slots[1]);
    expect(liveSlotCount()).toBe(3);

    dropSlot(makeSlot());
    expect(liveSlotCount()).toBe(3);
  });

  it("treats a double claim as a no-op that keeps eviction order", () => {
    const slots = claimMany(BUDGET + 1);
    // StrictMode runs effects twice: the second claim must not double-count
    // nor move the slot to the back of the eviction queue.
    claimSlot(slots[0]);
    expect(liveSlotCount()).toBe(BUDGET + 1);

    slots[0].onScreen = false;
    slots[1].onScreen = false;
    evictOverBudget();

    expect(slots[0].evict).toHaveBeenCalledTimes(1);
    expect(slots[1].evict).not.toHaveBeenCalled();
  });

  it("lets an evicted slot re-claim without re-firing its evict", () => {
    const slots = claimMany(BUDGET + 1);
    slots[0].onScreen = false;
    evictOverBudget();
    expect(liveSlotCount()).toBe(BUDGET);

    // Scrolled back into view.
    slots[0].onScreen = true;
    claimSlot(slots[0]);

    expect(liveSlotCount()).toBe(BUDGET + 1);
    expect(slots[0].evict).toHaveBeenCalledTimes(1);
  });

  it("resets the registry between runs", () => {
    claimMany(3);
    resetSlotRegistry();
    expect(liveSlotCount()).toBe(0);
  });
});
