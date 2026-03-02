import { describe, it, expect } from "vitest";
import { getInitialSeconds, getNextCountdown } from "../use-countdown";

describe("getInitialSeconds", () => {
  it("returns null when intervalMs is false", () => {
    expect(getInitialSeconds(false)).toBeNull();
  });

  it("returns whole seconds rounded up", () => {
    expect(getInitialSeconds(30_000)).toBe(30);
    expect(getInitialSeconds(60_000)).toBe(60);
    expect(getInitialSeconds(300_000)).toBe(300);
  });
});

describe("getNextCountdown", () => {
  it("decrements by 1 each tick", () => {
    expect(getNextCountdown(30, 30)).toBe(29);
    expect(getNextCountdown(5, 30)).toBe(4);
    expect(getNextCountdown(2, 30)).toBe(1);
  });

  it("resets to total when prev is 1", () => {
    expect(getNextCountdown(1, 30)).toBe(30);
  });

  it("resets to total when prev is null", () => {
    expect(getNextCountdown(null, 30)).toBe(30);
  });
});
