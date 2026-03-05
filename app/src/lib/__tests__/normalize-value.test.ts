import { describe, it, expect } from "vitest";
import { normalizeValue } from "../normalize-value";

describe("normalizeValue", () => {
  // Primitives pass through
  it("returns string as-is", () => {
    expect(normalizeValue("hello")).toBe("hello");
  });

  it("returns number as-is", () => {
    expect(normalizeValue(42)).toBe(42);
  });

  it("returns boolean as-is", () => {
    expect(normalizeValue(true)).toBe(true);
  });

  // Null / undefined
  it("returns null for null", () => {
    expect(normalizeValue(null)).toBeNull();
  });

  it("returns null for undefined", () => {
    expect(normalizeValue(undefined)).toBeNull();
  });

  // Date objects
  it("formats a valid Date as readable ISO-like string", () => {
    const date = new Date("2024-03-15T10:30:00Z");
    const result = normalizeValue(date);
    expect(typeof result).toBe("string");
    expect(result).toContain("2024-03-15");
    expect(result).toContain("10:30:00");
  });

  it("handles invalid Date gracefully", () => {
    const date = new Date("invalid");
    const result = normalizeValue(date);
    expect(typeof result).toBe("string");
  });

  // Generic object fallback
  it("JSON stringifies a plain object", () => {
    const obj = { foo: "bar" };
    const result = normalizeValue(obj);
    expect(result).toBe('{"foo":"bar"}');
  });

  it("JSON stringifies an array", () => {
    const arr = [1, 2, 3];
    const result = normalizeValue(arr);
    expect(result).toBe("[1,2,3]");
  });

  // Empty string
  it("returns empty string as-is", () => {
    expect(normalizeValue("")).toBe("");
  });

  // Zero
  it("returns 0 as-is", () => {
    expect(normalizeValue(0)).toBe(0);
  });
});
