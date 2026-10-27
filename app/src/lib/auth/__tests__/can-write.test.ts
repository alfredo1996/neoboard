import { describe, it, expect } from "vitest";
import { effectiveCanWrite } from "../can-write";

describe("effectiveCanWrite", () => {
  it.each([
    ["admin", false, true],
    ["reader", true, false],
    ["creator", undefined, true],
    ["creator", true, true],
    ["creator", false, false],
  ] as const)("%s with flag %s -> %s", (role, flag, expected) => {
    expect(effectiveCanWrite(role, flag)).toBe(expected);
  });
});
