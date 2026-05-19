import { describe, it, expect } from "vitest";
import { contrastTextColor } from "../chart-utils";

describe("contrastTextColor", () => {
  it("returns white text on a dark background", () => {
    expect(contrastTextColor("#000000")).toBe("#ffffff");
    expect(contrastTextColor("#222222")).toBe("#ffffff");
    expect(contrastTextColor("#0000ff")).toBe("#ffffff");
  });

  it("returns black text on a light background", () => {
    expect(contrastTextColor("#ffffff")).toBe("#000000");
    expect(contrastTextColor("#eeeeee")).toBe("#000000");
    expect(contrastTextColor("#ffff00")).toBe("#000000");
  });

  it("accepts shorthand #rgb hex", () => {
    expect(contrastTextColor("#000")).toBe("#ffffff");
    expect(contrastTextColor("#fff")).toBe("#000000");
    expect(contrastTextColor("#0f0")).toBe("#000000");
  });

  it("accepts uppercase hex", () => {
    expect(contrastTextColor("#FFFFFF")).toBe("#000000");
    expect(contrastTextColor("#AABBCC")).toBe("#000000");
  });

  it("parses rgb() and rgba() color strings", () => {
    expect(contrastTextColor("rgb(0, 0, 0)")).toBe("#ffffff");
    expect(contrastTextColor("rgb(255, 255, 255)")).toBe("#000000");
    expect(contrastTextColor("rgba(10, 10, 10, 0.5)")).toBe("#ffffff");
  });

  it("parses percentage components in rgb()", () => {
    expect(contrastTextColor("rgb(0%, 0%, 0%)")).toBe("#ffffff");
    expect(contrastTextColor("rgb(100%, 100%, 100%)")).toBe("#000000");
  });

  it("falls back to black for unparseable inputs instead of producing invisible text", () => {
    // Previously these would crash or silently parse to NaN and emit white
    // text — invisible on light backgrounds set by the same styling rule.
    expect(contrastTextColor("red")).toBe("#000000");
    expect(contrastTextColor("var(--accent)")).toBe("#000000");
    expect(contrastTextColor("hsl(0, 100%, 50%)")).toBe("#000000");
    expect(contrastTextColor("")).toBe("#000000");
    expect(contrastTextColor("garbage")).toBe("#000000");
  });

  it("rejects malformed hex strings", () => {
    expect(contrastTextColor("#12")).toBe("#000000");
    expect(contrastTextColor("#12345")).toBe("#000000");
    expect(contrastTextColor("#1234567")).toBe("#000000");
    expect(contrastTextColor("#zzz")).toBe("#000000");
  });

  it("rejects malformed rgb() inputs", () => {
    expect(contrastTextColor("rgb(0, 0)")).toBe("#000000");
    expect(contrastTextColor("rgb(a, b, c)")).toBe("#000000");
  });

  it("rejects rgb()/rgba() with wrong arity (extra channels are not silently dropped)", () => {
    // Previously rgb(1,2,3,4,5) parsed the first 3 channels and ignored the
    // rest, accepting clearly malformed input.
    expect(contrastTextColor("rgb(1, 2, 3, 4)")).toBe("#000000");
    expect(contrastTextColor("rgb(1, 2, 3, 4, 5)")).toBe("#000000");
    expect(contrastTextColor("rgba(1, 2, 3)")).toBe("#000000");
    expect(contrastTextColor("rgba(1, 2, 3, 0.5, 9)")).toBe("#000000");
  });

  it("rejects rgba() with alpha outside [0, 1]", () => {
    expect(contrastTextColor("rgba(0, 0, 0, 2)")).toBe("#000000");
    expect(contrastTextColor("rgba(0, 0, 0, -0.1)")).toBe("#000000");
    expect(contrastTextColor("rgba(0, 0, 0, foo)")).toBe("#000000");
  });

  it("accepts valid rgba() with in-range alpha", () => {
    // Sanity: the stricter validator must not regress valid inputs.
    expect(contrastTextColor("rgba(0, 0, 0, 0)")).toBe("#ffffff");
    expect(contrastTextColor("rgba(255, 255, 255, 1)")).toBe("#000000");
  });
});
