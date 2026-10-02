import { describe, it, expect } from "vitest";
import { safeCallbackPath } from "../callback-path";

describe("safeCallbackPath (#2170)", () => {
  it.each([
    ["/", "/"],
    ["/dash/1?x=1#y", "/dash/1?x=1#y"],
    ["https://evil.example", "/"],
    ["//evil.example", "/"],
    ["/\\evil.example", "/"],
    ["javascript:alert(1)", "/"],
    ["", "/"],
    [undefined, "/"],
    ["/\t/evil.example", "/"],
    ["/dash\n1", "/"],
  ])("%j -> %j", (value, expected) => {
    expect(safeCallbackPath(value)).toBe(expected);
  });
});
