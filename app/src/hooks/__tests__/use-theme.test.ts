// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useTheme } from "../use-theme";

// ---------------------------------------------------------------------------
// matchMedia mock — simulates OS prefers-color-scheme
// ---------------------------------------------------------------------------
let osDark = false;
const mediaListeners = new Set<(e: MediaQueryListEvent) => void>();

function createMatchMedia() {
  return (query: string): MediaQueryList => {
    const mql = {
      matches: query === "(prefers-color-scheme: dark)" ? osDark : false,
      media: query,
      onchange: null,
      addEventListener: (_: string, cb: (e: MediaQueryListEvent) => void) => {
        mediaListeners.add(cb);
      },
      removeEventListener: (_: string, cb: (e: MediaQueryListEvent) => void) => {
        mediaListeners.delete(cb);
      },
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    } as unknown as MediaQueryList;
    return mql;
  };
}

function setOsDark(dark: boolean) {
  osDark = dark;
  for (const cb of mediaListeners) {
    cb({ matches: dark } as MediaQueryListEvent);
  }
}

// ---------------------------------------------------------------------------
// Setup / teardown
// ---------------------------------------------------------------------------
describe("useTheme", () => {
  beforeEach(() => {
    osDark = false;
    mediaListeners.clear();
    document.documentElement.className = "";
    localStorage.clear();
    window.matchMedia = createMatchMedia();
  });

  afterEach(() => {
    document.documentElement.className = "";
    localStorage.clear();
    mediaListeners.clear();
  });

  // 1
  it("defaults to 'system' when nothing in localStorage", () => {
    const { result } = renderHook(() => useTheme());
    expect(result.current.preference).toBe("system");
  });

  // 2
  it("resolvedTheme is 'dark' when preference=system and OS is dark", () => {
    osDark = true;
    // Re-create matchMedia so it picks up the new osDark value
    window.matchMedia = createMatchMedia();
    const { result } = renderHook(() => useTheme());
    expect(result.current.preference).toBe("system");
    expect(result.current.resolvedTheme).toBe("dark");
  });

  // 3
  it("resolvedTheme is 'light' when preference=system and OS is light", () => {
    osDark = false;
    const { result } = renderHook(() => useTheme());
    expect(result.current.preference).toBe("system");
    expect(result.current.resolvedTheme).toBe("light");
  });

  // 4
  it("reads stored 'dark' preference → resolvedTheme is 'dark'", () => {
    localStorage.setItem("neoboard-theme", "dark");
    const { result } = renderHook(() => useTheme());
    expect(result.current.preference).toBe("dark");
    expect(result.current.resolvedTheme).toBe("dark");
  });

  // 5
  it("reads stored 'light' preference → resolvedTheme is 'light'", () => {
    localStorage.setItem("neoboard-theme", "light");
    const { result } = renderHook(() => useTheme());
    expect(result.current.preference).toBe("light");
    expect(result.current.resolvedTheme).toBe("light");
  });

  // 6
  it("setTheme('dark') stores preference and applies .dark class", () => {
    const { result } = renderHook(() => useTheme());
    act(() => {
      result.current.setTheme("dark");
    });
    expect(result.current.preference).toBe("dark");
    expect(localStorage.getItem("neoboard-theme")).toBe("dark");
    expect(document.documentElement.classList.contains("dark")).toBe(true);
  });

  // 7
  it("setTheme('light') stores preference and removes .dark class", () => {
    document.documentElement.classList.add("dark");
    localStorage.setItem("neoboard-theme", "dark");
    const { result } = renderHook(() => useTheme());
    act(() => {
      result.current.setTheme("light");
    });
    expect(result.current.preference).toBe("light");
    expect(localStorage.getItem("neoboard-theme")).toBe("light");
    expect(document.documentElement.classList.contains("dark")).toBe(false);
  });

  // 8
  it("setTheme('system') stores preference and resolves from OS", () => {
    osDark = true;
    window.matchMedia = createMatchMedia();
    const { result } = renderHook(() => useTheme());
    act(() => {
      result.current.setTheme("system");
    });
    expect(result.current.preference).toBe("system");
    expect(localStorage.getItem("neoboard-theme")).toBe("system");
    expect(result.current.resolvedTheme).toBe("dark");
    expect(document.documentElement.classList.contains("dark")).toBe(true);
  });

  // 9
  it("reacts to OS theme change in real-time when preference=system", () => {
    const { result } = renderHook(() => useTheme());
    expect(result.current.resolvedTheme).toBe("light");

    act(() => {
      setOsDark(true);
    });
    expect(result.current.resolvedTheme).toBe("dark");
    expect(document.documentElement.classList.contains("dark")).toBe(true);
  });

  // 10
  it("does NOT react to OS change when preference is explicit", () => {
    localStorage.setItem("neoboard-theme", "light");
    const { result } = renderHook(() => useTheme());
    expect(result.current.resolvedTheme).toBe("light");

    act(() => {
      setOsDark(true);
    });
    // Preference is explicitly "light" — should stay light
    expect(result.current.resolvedTheme).toBe("light");
    expect(document.documentElement.classList.contains("dark")).toBe(false);
  });

  // 11
  it("falls back to 'system' for invalid localStorage values", () => {
    localStorage.setItem("neoboard-theme", "invalid-value");
    const { result } = renderHook(() => useTheme());
    expect(result.current.preference).toBe("system");
  });

  // 12
  it("applies .dark class on mount when resolved=dark", () => {
    localStorage.setItem("neoboard-theme", "dark");
    renderHook(() => useTheme());
    expect(document.documentElement.classList.contains("dark")).toBe(true);
  });

  // 13
  it("does not expose toggleTheme in return value", () => {
    const { result } = renderHook(() => useTheme());
    expect(result.current).not.toHaveProperty("toggleTheme");
  });
});
