import { describe, it, expect, vi, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useFilterBarShown, FILTER_BAR_KEY } from "../use-filter-bar-shown";

afterEach(() => {
  vi.restoreAllMocks();
  // A successful write also clears the in-memory fallback, whatever test ran.
  renderHook(() => useFilterBarShown()).result.current[1](true);
  localStorage.clear();
});

describe("useFilterBarShown", () => {
  it("is shown by default", () => {
    expect(renderHook(() => useFilterBarShown()).result.current[0]).toBe(true);
  });

  it("is hidden when the stored preference is off", () => {
    localStorage.setItem(FILTER_BAR_KEY, "off");
    expect(renderHook(() => useFilterBarShown()).result.current[0]).toBe(false);
  });

  it("is shown when localStorage throws on read", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    expect(renderHook(() => useFilterBarShown()).result.current[0]).toBe(true);
  });

  it("stores the choice, and every user of it follows", () => {
    const a = renderHook(() => useFilterBarShown());
    const b = renderHook(() => useFilterBarShown());
    act(() => a.result.current[1](false));
    expect(localStorage.getItem(FILTER_BAR_KEY)).toBe("off");
    expect(b.result.current[0]).toBe(false);
    act(() => a.result.current[1](true));
    expect(b.result.current[0]).toBe(true);
  });

  it("still switches in memory when localStorage throws on write", () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    const { result } = renderHook(() => useFilterBarShown());
    act(() => result.current[1](false));
    expect(result.current[0]).toBe(false);
  });
});
