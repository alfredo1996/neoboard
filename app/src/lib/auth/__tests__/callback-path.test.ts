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
    ["/a/..//evil.example", "/"],
    ["/.//evil.example", "/"],
    ["/%2e%2e//evil.example", "/"],
    ["/a\\..\\..\\/evil.example", "/"],
    ["/\\evil", "/"],
    ["\\\\evil", "/"],
    ["/a/../dash/1?x=1#y", "/dash/1?x=1#y"],
  ])("%j -> %j", (value, expected) => {
    expect(safeCallbackPath(value)).toBe(expected);
  });
});
