import { describe, it, expect } from "vitest";
import { createRequire } from "node:module";
import { cn, CUSTOM_TEXT_SIZES } from "../utils";

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- CommonJS preset, untyped
const preset: any = createRequire(__filename)("../../../tailwind-preset.cjs");

// The preset's custom text sizes (#2215, plus the older h1-h3).
const sizes = Object.keys(preset.theme.extend.fontSize);

describe("cn keeps a custom text size next to a text colour (#2215)", () => {
  it.each(sizes)("text-%s and text-muted-foreground, either order", (size) => {
    expect(cn(`text-${size} text-muted-foreground`)).toBe(
      `text-${size} text-muted-foreground`,
    );
    expect(cn(`text-muted-foreground text-${size}`)).toBe(
      `text-muted-foreground text-${size}`,
    );
  });

  it("the last of two sizes wins", () => {
    expect(cn("text-meta text-section")).toBe("text-section");
    expect(cn("text-sm text-meta")).toBe("text-meta");
  });

  it("the last of two colours still wins", () => {
    expect(cn("text-meta text-foreground text-muted-foreground")).toBe(
      "text-meta text-muted-foreground",
    );
  });

  it("cn's size list is the preset's fontSize keys (a new size cannot be forgotten)", () => {
    expect([...CUSTOM_TEXT_SIZES].sort()).toEqual([...sizes].sort());
  });
});

describe("cn knows the custom radii (#2215)", () => {
  it.each(["overlay", "checkbox"])("rounded-%s replaces rounded-md", (r) => {
    expect(cn("rounded-md", `rounded-${r}`)).toBe(`rounded-${r}`);
  });
});
