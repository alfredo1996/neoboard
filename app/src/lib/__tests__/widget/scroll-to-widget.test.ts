import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  scrollAndHighlight,
  scrollToWidgetWhenReady,
} from "@/lib/widget/scroll-to-widget";

// ── DOM mocks ────────────────────────────────────────────────────────────────
// The test environment is Node (no real DOM). We stub the minimal surface
// needed by the scroll helpers.

function makeFakeElement(hidden = false) {
  return {
    scrollIntoView: vi.fn(),
    classList: { add: vi.fn(), remove: vi.fn() },
    closest: vi.fn(() => (hidden ? {} : null)),
    addEventListener: vi.fn((_event: string, cb: () => void) => {
      // Immediately fire animationend for deterministic tests
      cb();
    }),
    removeEventListener: vi.fn(),
  };
}

beforeEach(() => {
  // Stub CSS.escape (not available in Node)
  vi.stubGlobal("CSS", {
    escape: (v: string) => v.replace(/([^\w-])/g, "\\$1"),
  });
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

// ── scrollAndHighlight ───────────────────────────────────────────────────────

describe("scrollAndHighlight", () => {
  // The scroll/highlight/cleanup behaviour is asserted against a real DOM in
  // `src/lib/widget/__tests__/scroll-to-widget.test.tsx` (jsdom project). The
  // mock-based versions that used to live here asserted only that a stubbed
  // `addEventListener` had invoked its own callback, which stayed green
  // whether or not the highlight was ever cleared (#1458). What remains here
  // is the part that genuinely needs no DOM: selector construction.

  it("uses CSS.escape on the widgetId to handle special characters", () => {
    const qsa = vi.fn<(selector: string) => Element | null>(() => null);
    vi.stubGlobal("document", { querySelector: qsa });

    scrollAndHighlight("widget:1.2");

    // CSS.escape escapes the colon and dot
    const selector = qsa.mock.calls[0][0];
    expect(selector).toContain("\\:");
    expect(selector).toContain("\\.");
  });
});

// ── scrollToWidgetWhenReady ──────────────────────────────────────────────────

describe("scrollToWidgetWhenReady", () => {
  it("retries via requestAnimationFrame until the element appears", () => {
    let call = 0;
    const el = makeFakeElement();
    const qsa = vi.fn(() => {
      call++;
      return call >= 3 ? el : null; // appears on 3rd try
    });
    vi.stubGlobal("document", { querySelector: qsa });

    // Collect RAF callbacks and run them synchronously
    const callbacks: Array<() => void> = [];
    vi.stubGlobal("requestAnimationFrame", (cb: () => void) => {
      callbacks.push(cb);
    });

    scrollToWidgetWhenReady("w1", 10);

    // Drain the RAF queue
    while (callbacks.length > 0) {
      const cb = callbacks.shift()!;
      cb();
    }

    // Should have queried 3 times (2 misses + 1 hit)
    expect(qsa).toHaveBeenCalledTimes(3);
    expect(el.scrollIntoView).toHaveBeenCalled();
  });

  it("gives up after maxRetries", () => {
    const qsa = vi.fn<(selector: string) => Element | null>(() => null);
    vi.stubGlobal("document", { querySelector: qsa });

    const callbacks: Array<() => void> = [];
    vi.stubGlobal("requestAnimationFrame", (cb: () => void) => {
      callbacks.push(cb);
    });

    scrollToWidgetWhenReady("w1", 3);

    while (callbacks.length > 0) {
      const cb = callbacks.shift()!;
      cb();
    }

    // 1 initial call + 3 retries = 4 total RAF calls, but querySelector
    // called on each tryScroll invocation: initial + 2 retries (stops when
    // attempts reaches maxRetries)
    // Actually: first RAF fires tryScroll (attempt 0 -> fail, ++attempts=1 < 3 -> RAF),
    // second RAF (attempt 1 -> fail, ++attempts=2 < 3 -> RAF),
    // third RAF (attempt 2 -> fail, ++attempts=3 >= 3 -> stop)
    expect(qsa).toHaveBeenCalledTimes(3);
  });

  it("defaults to 30 retries", () => {
    const qsa = vi.fn<(selector: string) => Element | null>(() => null);
    vi.stubGlobal("document", { querySelector: qsa });

    const callbacks: Array<() => void> = [];
    vi.stubGlobal("requestAnimationFrame", (cb: () => void) => {
      callbacks.push(cb);
    });

    scrollToWidgetWhenReady("w1");

    while (callbacks.length > 0) {
      const cb = callbacks.shift()!;
      cb();
    }

    // 30 retries -> 30 querySelector calls
    expect(qsa).toHaveBeenCalledTimes(30);
  });
});
