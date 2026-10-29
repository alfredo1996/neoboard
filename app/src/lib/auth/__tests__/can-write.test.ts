import { describe, it, expect } from "vitest";
import { canManageConnections, effectiveCanWrite } from "../can-write";

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

describe("canManageConnections", () => {
  it.each([
    ["reader", false],
    ["creator", true],
    ["admin", true],
    [undefined, false],
  ] as const)("%s -> %s", (role, expected) => {
    expect(canManageConnections(role)).toBe(expected);
  });
});
