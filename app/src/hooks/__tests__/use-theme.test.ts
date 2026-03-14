// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useTheme } from "../use-theme";

describe("useTheme", () => {
  beforeEach(() => {
    document.documentElement.className = "";
    localStorage.clear();
  });

  afterEach(() => {
    document.documentElement.className = "";
    localStorage.clear();
  });

  it("defaults to 'light' when no preference is stored", () => {
    const { result } = renderHook(() => useTheme());
    expect(result.current.theme).toBe("light");
  });

  it("reads stored preference from localStorage", () => {
    localStorage.setItem("neoboard-theme", "dark");
    const { result } = renderHook(() => useTheme());
    expect(result.current.theme).toBe("dark");
  });

  it("toggleTheme switches from light to dark", () => {
    const { result } = renderHook(() => useTheme());
    act(() => {
      result.current.toggleTheme();
    });
    expect(result.current.theme).toBe("dark");
    expect(document.documentElement.classList.contains("dark")).toBe(true);
    expect(localStorage.getItem("neoboard-theme")).toBe("dark");
  });

  it("toggleTheme switches from dark to light", () => {
    localStorage.setItem("neoboard-theme", "dark");
    document.documentElement.classList.add("dark");
    const { result } = renderHook(() => useTheme());
    act(() => {
      result.current.toggleTheme();
    });
    expect(result.current.theme).toBe("light");
    expect(document.documentElement.classList.contains("dark")).toBe(false);
    expect(localStorage.getItem("neoboard-theme")).toBe("light");
  });

  it("setTheme sets specific theme", () => {
    const { result } = renderHook(() => useTheme());
    act(() => {
      result.current.setTheme("dark");
    });
    expect(result.current.theme).toBe("dark");
    expect(document.documentElement.classList.contains("dark")).toBe(true);

    act(() => {
      result.current.setTheme("light");
    });
    expect(result.current.theme).toBe("light");
    expect(document.documentElement.classList.contains("dark")).toBe(false);
  });

  it("applies dark class on mount when stored preference is dark", () => {
    localStorage.setItem("neoboard-theme", "dark");
    renderHook(() => useTheme());
    expect(document.documentElement.classList.contains("dark")).toBe(true);
  });

  it("removes dark class on mount when stored preference is light", () => {
    document.documentElement.classList.add("dark");
    localStorage.setItem("neoboard-theme", "light");
    renderHook(() => useTheme());
    expect(document.documentElement.classList.contains("dark")).toBe(false);
  });

  it("falls back to light for invalid localStorage values", () => {
    localStorage.setItem("neoboard-theme", "invalid-value");
    const { result } = renderHook(() => useTheme());
    expect(result.current.theme).toBe("light");
  });
});
