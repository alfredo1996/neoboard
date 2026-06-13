import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, act } from "@testing-library/react";
import { useEffect } from "react";
import { LazyVisible } from "../lazy-visible";

/**
 * Controllable IntersectionObserver mock: capture the callback so a test can
 * drive intersection on/off and assert mount/unmount of the children — which
 * is how an off-screen graph releases its WebGL context (#1052).
 */
let intersectCb: ((entries: { isIntersecting: boolean }[]) => void) | null;
const disconnect = vi.fn();

beforeEach(() => {
  intersectCb = null;
  disconnect.mockClear();
  vi.stubGlobal(
    "IntersectionObserver",
    class {
      constructor(cb: (entries: { isIntersecting: boolean }[]) => void) {
        intersectCb = cb;
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
});

function setIntersecting(value: boolean) {
  act(() => {
    intersectCb?.([{ isIntersecting: value }]);
  });
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

  it("unmounts children when scrolled away, releasing the context", () => {
    const onUnmount = vi.fn();
    function GraphStub() {
      // A WebGL-backed graph disposes its context in an unmount cleanup; this
      // effect cleanup stands in for that and proves LazyVisible unmounts it.
      useEffect(() => onUnmount, []);
      return <div>heavy-graph</div>;
    }
    render(
      <LazyVisible fallback={<div>placeholder</div>}>
        <GraphStub />
      </LazyVisible>,
    );
    setIntersecting(true);
    expect(screen.getByText("heavy-graph")).toBeDefined();

    // Scroll out of view → children unmount (cleanup fires), fallback returns.
    setIntersecting(false);
    expect(screen.queryByText("heavy-graph")).toBeNull();
    expect(screen.getByText("placeholder")).toBeDefined();
    expect(onUnmount).toHaveBeenCalled();
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
