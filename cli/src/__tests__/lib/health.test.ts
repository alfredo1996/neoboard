import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("../../lib/output.js", () => ({
  createSpinner: vi.fn(() => ({
    start: vi.fn(),
    succeed: vi.fn(),
    fail: vi.fn(),
  })),
}));

import { waitForHealth } from "../../lib/health.js";

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
  vi.clearAllMocks();
});

describe("waitForHealth", () => {
  it("resolves immediately when check passes on first try", async () => {
    const check = vi.fn(() => true);
    await waitForHealth({ check, label: "test-service" });
    expect(check).toHaveBeenCalledTimes(1);
  });

  it("polls until check passes", async () => {
    let callCount = 0;
    const check = vi.fn(() => {
      callCount++;
      return callCount >= 3;
    });

    const promise = waitForHealth({
      check,
      label: "test-service",
      interval: 100,
    });

    await vi.advanceTimersByTimeAsync(100);
    await vi.advanceTimersByTimeAsync(100);

    await promise;
    expect(check).toHaveBeenCalledTimes(3);
  });

  it("throws on timeout", async () => {
    const check = vi.fn(() => false);
    const promise = waitForHealth({
      check,
      label: "test-service",
      interval: 100,
      timeout: 250,
    });

    // Attach the rejection handler BEFORE advancing timers, and await it at
    // the end. valid-expect wants the await on the expect itself, which would
    // deadlock here: nothing advances the fake timers until the line below.
    // eslint-disable-next-line vitest/valid-expect
    const rejection = expect(promise).rejects.toThrow(
      "Timeout waiting for test-service",
    );

    // Now advance past the timeout
    await vi.advanceTimersByTimeAsync(300);

    await rejection;
  });
});
