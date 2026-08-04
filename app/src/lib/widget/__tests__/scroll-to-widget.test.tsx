import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { scrollAndHighlight } from "../scroll-to-widget";

/**
 * `.tsx` on purpose: `app/`'s vitest routes `.test.ts` to the node project and
 * `.test.tsx` to jsdom, and these assertions need a DOM.
 */
describe("scrollAndHighlight", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    document.body.innerHTML = "";
    // jsdom has no layout engine and no scrollIntoView.
    Element.prototype.scrollIntoView = vi.fn();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  function mountWidget(id = "w-1") {
    const el = document.createElement("div");
    el.setAttribute("data-widget-id", id);
    document.body.appendChild(el);
    return el;
  }

  it("scrolls to the widget and marks it highlighted", () => {
    const el = mountWidget();

    expect(scrollAndHighlight("w-1")).toBe(true);
    expect(el.classList.contains("widget-highlight")).toBe(true);
    expect(el.scrollIntoView).toHaveBeenCalled();
  });

  it("clears the highlight when the animation ends", () => {
    const el = mountWidget();
    scrollAndHighlight("w-1");

    el.dispatchEvent(new Event("animationend"));

    expect(el.classList.contains("widget-highlight")).toBe(false);
  });

  // The reason this file exists (#1458). Under `prefers-reduced-motion: reduce`
  // the global reset sets `animation: none`, so the pulse keyframe never runs
  // and `animationend` never fires. An animationend-only cleanup leaves the
  // class on the element forever.
  it("clears the highlight when no animationend ever fires", () => {
    const el = mountWidget();
    scrollAndHighlight("w-1");

    expect(el.classList.contains("widget-highlight")).toBe(true);
    vi.advanceTimersByTime(2000);

    expect(el.classList.contains("widget-highlight")).toBe(false);
  });

  // An interrupted animation dispatches `animationcancel`, never `animationend`
  // — the same leak by a different route.
  it("clears the highlight when the animation is cancelled", () => {
    const el = mountWidget();
    scrollAndHighlight("w-1");

    el.dispatchEvent(new Event("animationcancel"));

    expect(el.classList.contains("widget-highlight")).toBe(false);
  });

  // Animation events bubble. A widget card contains chart content that
  // animates in its own right (skeletons, spinners, ECharts), and any one of
  // those finishing would otherwise clear the highlight the moment it landed.
  it("ignores animation events bubbling up from descendants", () => {
    const el = mountWidget();
    const child = document.createElement("div");
    el.appendChild(child);
    scrollAndHighlight("w-1");

    child.dispatchEvent(new Event("animationend", { bubbles: true }));
    expect(el.classList.contains("widget-highlight")).toBe(true);

    child.dispatchEvent(new Event("animationcancel", { bubbles: true }));
    expect(el.classList.contains("widget-highlight")).toBe(true);

    // The widget's own animation still clears it.
    el.dispatchEvent(new Event("animationend"));
    expect(el.classList.contains("widget-highlight")).toBe(false);
  });

  it("does not leave a pending timer once the animation has ended", () => {
    const el = mountWidget();
    scrollAndHighlight("w-1");

    el.dispatchEvent(new Event("animationend"));
    el.classList.add("widget-highlight"); // e.g. a second navigation re-highlights
    vi.advanceTimersByTime(2000);

    // The first call's fallback must not strip the second call's highlight.
    expect(el.classList.contains("widget-highlight")).toBe(true);
  });

  it("returns false when the widget is not on the page", () => {
    expect(scrollAndHighlight("missing")).toBe(false);
  });

  it("returns false when the widget sits in a hidden subtree", () => {
    const wrapper = document.createElement("div");
    wrapper.className = "hidden";
    const el = document.createElement("div");
    el.setAttribute("data-widget-id", "w-1");
    wrapper.appendChild(el);
    document.body.appendChild(wrapper);

    expect(scrollAndHighlight("w-1")).toBe(false);
    expect(el.classList.contains("widget-highlight")).toBe(false);
  });
});
