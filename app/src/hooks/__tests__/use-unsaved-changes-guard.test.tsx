import { describe, it, expect, beforeEach, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useUnsavedChangesWarning } from "../use-unsaved-changes-warning";
import { useDashboardStore } from "../../stores/dashboard-store";

// #2325: one guard for every way out of a dirty editor.
const layout = {
  version: 2 as const,
  pages: [{ id: "p1", title: "Page 1", widgets: [], gridLayout: [] }],
};

// jsdom does not pop on its own: landing on the editor's entry is its state.
function popstate() {
  window.history.replaceState(null, "", window.location.href);
  act(() => {
    window.dispatchEvent(new PopStateEvent("popstate"));
  });
}

function makeDirty() {
  act(() => useDashboardStore.getState().addPage());
}

describe("useUnsavedChangesWarning (#2325)", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    useDashboardStore.getState().reset();
    useDashboardStore.getState().setLayout(layout);
    window.history.replaceState(null, "", "/d1/edit");
  });

  it("requestNavigation passes when clean and holds the url when dirty", () => {
    const { result } = renderHook(() => useUnsavedChangesWarning());
    expect(result.current.requestNavigation("/x")).toBe(true);
    makeDirty();
    let allowed = true;
    act(() => {
      allowed = result.current.requestNavigation("/x");
    });
    expect(allowed).toBe(false);
    expect(result.current.showNavWarning).toBe(true);
  });

  it("confirming runs the caller's own leave action", () => {
    const { result } = renderHook(() => useUnsavedChangesWarning());
    makeDirty();
    const onLeave = vi.fn();
    act(() => {
      result.current.requestNavigation("/login", onLeave);
    });
    act(() => result.current.confirmNavigation());
    expect(onLeave).toHaveBeenCalledOnce();
  });

  it("holds one same-URL entry while dirty, so Back keeps the editor URL", () => {
    const before = window.history.length;
    renderHook(() => useUnsavedChangesWarning());
    makeDirty();
    makeDirty();
    expect(window.history.length).toBe(before + 1);
    expect(window.location.pathname).toBe("/d1/edit");
  });

  it("a popstate opens the warning and Stay puts the held entry back", () => {
    const { result } = renderHook(() => useUnsavedChangesWarning());
    makeDirty();
    const len = window.history.length;
    popstate();
    expect(result.current.showNavWarning).toBe(true);
    expect(window.location.pathname).toBe("/d1/edit");
    expect(window.history.length).toBe(len);
    act(() => result.current.cancelNavigation());
    expect(window.history.length).toBe(len + 1);
  });

  it("after Leave a second popstate does not warn again (the loop)", () => {
    const back = vi.spyOn(window.history, "back").mockImplementation(() => {});
    const { result } = renderHook(() => useUnsavedChangesWarning());
    makeDirty();
    popstate();
    act(() => result.current.confirmNavigation());
    expect(back).toHaveBeenCalledOnce();
    popstate();
    expect(result.current.showNavWarning).toBe(false);
  });

  it("Leave drops the edits so the next Edit starts from the saved page", () => {
    vi.spyOn(window.history, "back").mockImplementation(() => {});
    const { result } = renderHook(() => useUnsavedChangesWarning());
    makeDirty();
    popstate();
    act(() => result.current.confirmNavigation());
    expect(useDashboardStore.getState().hasUnsavedChanges()).toBe(false);
    expect(useDashboardStore.getState().layout.pages).toHaveLength(1);
  });

  it("a second dirty session on the same instance is guarded again", () => {
    vi.spyOn(window.history, "back").mockImplementation(() => {});
    const { result } = renderHook(() => useUnsavedChangesWarning());
    makeDirty();
    popstate();
    act(() => result.current.confirmNavigation());
    popstate(); // the back() lands
    act(() => useDashboardStore.getState().setLayout(layout));
    makeDirty();
    const ev = new Event("beforeunload", { cancelable: true });
    window.dispatchEvent(ev);
    expect(ev.defaultPrevented).toBe(true);
    popstate();
    expect(result.current.showNavWarning).toBe(true);
  });

  it("a later dirty editor on another dashboard holds a new entry", () => {
    renderHook(() => useUnsavedChangesWarning());
    makeDirty();
    act(() => useDashboardStore.getState().markSaved());
    // A clean router.push out: Next writes its own state, the marker is gone.
    window.history.pushState(null, "", "/d2/edit");
    act(() => useDashboardStore.getState().setLayout(layout));
    const len = window.history.length;
    makeDirty();
    expect(window.history.length).toBe(len + 1);
  });

  it("an abandoned dialog does not leave an old exit armed", () => {
    vi.spyOn(window.history, "back").mockImplementation(() => {});
    const { result } = renderHook(() => useUnsavedChangesWarning());
    makeDirty();
    const onLeave = vi.fn();
    act(() => {
      result.current.requestNavigation("/login", onLeave);
    });
    act(() => result.current.setShowNavWarning(false)); // Escape
    popstate();
    act(() => result.current.confirmNavigation());
    expect(onLeave).not.toHaveBeenCalled();
  });
});
