import { describe, it, expect } from "vitest";
import { parseOptionalInt } from "../parse-utils";

describe("parseOptionalInt", () => {
  it("returns undefined for empty string", () => {
    expect(parseOptionalInt("")).toBeUndefined();
  });

  it("returns undefined for whitespace-only string", () => {
    expect(parseOptionalInt("   ")).toBeUndefined();
  });

  it("parses valid positive integer", () => {
    expect(parseOptionalInt("42")).toBe(42);
  });

  it("parses zero", () => {
    expect(parseOptionalInt("0")).toBe(0);
  });

  it("parses negative integer", () => {
    expect(parseOptionalInt("-5")).toBe(-5);
  });

  it("returns undefined for floating point number", () => {
    expect(parseOptionalInt("3.14")).toBeUndefined();
  });

  it("returns undefined for non-numeric string", () => {
    expect(parseOptionalInt("abc")).toBeUndefined();
  });

  it("returns undefined for Infinity", () => {
    expect(parseOptionalInt("Infinity")).toBeUndefined();
  });

  it("returns undefined for NaN string", () => {
    expect(parseOptionalInt("NaN")).toBeUndefined();
  });

  it("parses string with leading/trailing whitespace", () => {
    expect(parseOptionalInt("  100  ")).toBe(100);
  });

  it("parses large integers", () => {
    expect(parseOptionalInt("300000")).toBe(300000);
  });
});
