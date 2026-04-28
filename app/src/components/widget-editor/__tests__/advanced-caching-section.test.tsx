import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

vi.mock("@neoboard/components", () => ({
  Checkbox: ({
    id,
    checked,
    onCheckedChange,
  }: {
    id?: string;
    checked?: boolean;
    onCheckedChange?: (v: boolean) => void;
  }) => (
    <input
      type="checkbox"
      id={id}
      checked={checked}
      onChange={(e) => onCheckedChange?.(e.target.checked)}
      data-testid={id}
    />
  ),
  Input: ({
    id,
    value,
    onChange,
    ...props
  }: React.InputHTMLAttributes<HTMLInputElement>) => (
    <input
      id={id}
      value={value}
      onChange={onChange}
      data-testid={id}
      {...props}
    />
  ),
  Label: ({
    children,
    htmlFor,
  }: React.PropsWithChildren<{ htmlFor?: string }>) => (
    <label htmlFor={htmlFor}>{children}</label>
  ),
}));

const mockSetEnableCache = vi.fn();
const mockSetCacheTtlMinutes = vi.fn();

vi.mock("@/stores/widget-editor-store", () => ({
  useWidgetEditorStore: (selector: (s: Record<string, unknown>) => unknown) =>
    selector({
      enableCache: mockEnableCache,
      setEnableCache: mockSetEnableCache,
      cacheTtlMinutes: mockCacheTtlMinutes,
      setCacheTtlMinutes: mockSetCacheTtlMinutes,
    }),
}));

let mockEnableCache = false;
let mockCacheTtlMinutes = 5;

import { AdvancedCachingSection } from "../advanced-caching-section";

describe("AdvancedCachingSection", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockEnableCache = false;
    mockCacheTtlMinutes = 5;
  });

  it("renders caching header and checkbox", () => {
    render(<AdvancedCachingSection />);
    expect(screen.getByText("Caching")).toBeInTheDocument();
    expect(screen.getByText("Cache query results")).toBeInTheDocument();
  });

  it("does not show TTL input when caching is disabled", () => {
    render(<AdvancedCachingSection />);
    expect(screen.queryByTestId("cache-ttl")).not.toBeInTheDocument();
  });

  it("shows TTL input when caching is enabled", () => {
    mockEnableCache = true;
    render(<AdvancedCachingSection />);
    expect(screen.getByTestId("cache-ttl")).toBeInTheDocument();
    expect(screen.getByText(/Results are reused/)).toBeInTheDocument();
  });

  it("calls setEnableCache when checkbox toggled", () => {
    render(<AdvancedCachingSection />);
    fireEvent.click(screen.getByTestId("enable-cache"));
    expect(mockSetEnableCache).toHaveBeenCalledWith(true);
  });

  it("calls setCacheTtlMinutes when TTL changes", () => {
    mockEnableCache = true;
    render(<AdvancedCachingSection />);
    fireEvent.change(screen.getByTestId("cache-ttl"), {
      target: { value: "10" },
    });
    expect(mockSetCacheTtlMinutes).toHaveBeenCalledWith(10);
  });

  it("clamps TTL to minimum of 1", () => {
    mockEnableCache = true;
    render(<AdvancedCachingSection />);
    fireEvent.change(screen.getByTestId("cache-ttl"), {
      target: { value: "0" },
    });
    expect(mockSetCacheTtlMinutes).toHaveBeenCalledWith(1);
  });

  it("pluralizes minutes correctly", () => {
    mockEnableCache = true;
    mockCacheTtlMinutes = 1;
    const { rerender } = render(<AdvancedCachingSection />);
    expect(screen.getByText(/1 minute before/)).toBeInTheDocument();

    mockCacheTtlMinutes = 5;
    rerender(<AdvancedCachingSection />);
    expect(screen.getByText(/5 minutes before/)).toBeInTheDocument();
  });
});
