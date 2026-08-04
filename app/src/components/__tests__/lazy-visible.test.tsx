import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, act } from "@testing-library/react";
import { useEffect } from "react";
import { LazyVisible } from "../lazy-visible";
import {
  WEBGL_WIDGET_BUDGET,
  claimSlot,
  evictOverBudget,
  resetSlotRegistry,
} from "@/lib/widget/webgl-budget";

/**
 * Controllable IntersectionObserver mock: capture every constructed callback so
 * a test can drive intersection on/off per instance and assert mount/unmount of
 * the children. Sibling instances need to be independently drivable because the
 * WebGL budget (#1367) is a property of the whole page, not one slot.
 */
const intersectCbs: ((entries: { isIntersecting: boolean }[]) => void)[] = [];
const disconnect = vi.fn();

beforeEach(() => {
  intersectCbs.length = 0;
  disconnect.mockClear();
  resetSlotRegistry();
  vi.stubGlobal(
    "IntersectionObserver",
    class {
      constructor(cb: (entries: { isIntersecting: boolean }[]) => void) {
        intersectCbs.push(cb);
      }
      observe() {}
      disconnect() {
        disconnect();
      }
    },
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

function setIntersecting(value: boolean, index = 0) {
  act(() => {
    intersectCbs[index]?.([{ isIntersecting: value }]);
  });
}

/**
 * A WebGL-backed graph disposes its context in an unmount cleanup; this effect
 * cleanup stands in for that, so a test can prove whether LazyVisible unmounted
 * it or left it alone.
 */
function GraphStub({
  label = "heavy-graph",
  onUnmount,
}: {
  label?: string;
  onUnmount: () => void;
}) {
  useEffect(() => onUnmount, [onUnmount]);
  return <div>{label}</div>;
}

/** Render `count` sibling slots and return their unmount spies. */
function renderSlots(count: number) {
  const unmounts = Array.from({ length: count }, () => vi.fn());
  render(
    <>
      {unmounts.map((onUnmount, i) => (
        <LazyVisible key={i} fallback={<div>{`placeholder-${i}`}</div>}>
          <GraphStub label={`heavy-graph-${i}`} onUnmount={onUnmount} />
        </LazyVisible>
      ))}
    </>,
  );
  for (let i = 0; i < count; i++) setIntersecting(true, i);
  return unmounts;
}

describe("LazyVisible", () => {
  it("renders the fallback until the slot intersects the viewport", () => {
    render(
      <LazyVisible fallback={<div>placeholder</div>}>
        <div>heavy-graph</div>
      </LazyVisible>,
    );
    expect(screen.getByText("placeholder")).toBeDefined();
    expect(screen.queryByText("heavy-graph")).toBeNull();
  });

  it("mounts children when it scrolls into view", () => {
    render(
      <LazyVisible fallback={<div>placeholder</div>}>
        <div>heavy-graph</div>
      </LazyVisible>,
    );
    setIntersecting(true);
    expect(screen.getByText("heavy-graph")).toBeDefined();
    expect(screen.queryByText("placeholder")).toBeNull();
  });

  it("keeps children mounted when scrolled away under the budget (#1367)", () => {
    const onUnmount = vi.fn();
    render(
      <LazyVisible fallback={<div>placeholder</div>}>
        <GraphStub onUnmount={onUnmount} />
      </LazyVisible>,
    );
    setIntersecting(true);
    expect(screen.getByText("heavy-graph")).toBeDefined();

    // One live graph is nowhere near the WebGL budget, so scrolling it out of
    // view must not tear it down — the teardown is what made the force layout
    // restart and reshuffle the nodes on scroll-back.
    setIntersecting(false);
    expect(screen.getByText("heavy-graph")).toBeDefined();
    expect(screen.queryByText("placeholder")).toBeNull();
    expect(onUnmount).not.toHaveBeenCalled();
  });

  it("unmounts the off-screen child once over budget, releasing the context", () => {
    const unmounts = renderSlots(WEBGL_WIDGET_BUDGET + 1);
    expect(screen.getByText("heavy-graph-0")).toBeDefined();

    // One slot past the budget: the oldest off-screen graph gives up its
    // context, which is #1052's protection.
    setIntersecting(false, 0);
    expect(screen.queryByText("heavy-graph-0")).toBeNull();
    expect(screen.getByText("placeholder-0")).toBeDefined();
    expect(unmounts[0]).toHaveBeenCalled();

    // Every other slot is still on screen, so none of them was touched.
    for (let i = 1; i <= WEBGL_WIDGET_BUDGET; i++) {
      expect(screen.getByText(`heavy-graph-${i}`)).toBeDefined();
      expect(unmounts[i]).not.toHaveBeenCalled();
    }
  });

  it("remounts an evicted slot when it scrolls back into view", () => {
    renderSlots(WEBGL_WIDGET_BUDGET + 1);
    setIntersecting(false, 0);
    expect(screen.queryByText("heavy-graph-0")).toBeNull();

    setIntersecting(true, 0);
    expect(screen.getByText("heavy-graph-0")).toBeDefined();
    expect(screen.queryByText("placeholder-0")).toBeNull();
  });

  it("mounts eagerly when IntersectionObserver is unconstructable", () => {
    vi.useFakeTimers();
    vi.stubGlobal(
      "IntersectionObserver",
      class {
        constructor() {
          throw new Error("not constructable");
        }
      },
    );
    render(
      <LazyVisible fallback={<div>placeholder</div>}>
        <div>heavy-graph</div>
      </LazyVisible>,
    );
    expect(screen.queryByText("heavy-graph")).toBeNull();

    act(() => {
      vi.runAllTimers();
    });
    expect(screen.getByText("heavy-graph")).toBeDefined();

    // No observer exists to ever report this slot off-screen, so it must not be
    // an eviction candidate — otherwise the tile would go permanently blank on
    // a browser without IntersectionObserver. Fill the budget with on-screen
    // slots so the eager one is the only entry eviction could reach.
    for (let i = 0; i < WEBGL_WIDGET_BUDGET; i++) {
      claimSlot({ onScreen: true, evict: vi.fn() });
    }
    act(() => evictOverBudget());
    expect(screen.getByText("heavy-graph")).toBeDefined();
  });

  it("disconnects the observer on unmount", () => {
    const { unmount } = render(
      <LazyVisible fallback={<div>placeholder</div>}>
        <div>heavy-graph</div>
      </LazyVisible>,
    );
    unmount();
    expect(disconnect).toHaveBeenCalled();
  });
});
