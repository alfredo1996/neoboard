import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../commands/init.js", () => ({
  runInit: vi.fn(),
}));

vi.mock("../../commands/start.js", () => ({
  runStart: vi.fn(),
}));

vi.mock("../../lib/output.js", () => ({
  success: vi.fn(),
}));

import { runInit } from "../../commands/init.js";
import { runStart } from "../../commands/start.js";
import { success } from "../../lib/output.js";
import { runSetup } from "../../commands/setup.js";

const mockRunInit = vi.mocked(runInit);
const mockRunStart = vi.mocked(runStart);
const mockSuccess = vi.mocked(success);

beforeEach(() => {
  vi.clearAllMocks();
  mockRunStart.mockResolvedValue(true);
});

describe("runSetup", () => {
  it("calls init then start", async () => {
    await runSetup();
    expect(mockRunInit).toHaveBeenCalledBefore(mockRunStart);
  });

  it("passes mode to init", async () => {
    await runSetup({ mode: "local" });
    expect(mockRunInit).toHaveBeenCalledWith({ mode: "local" });
  });

  it("returns true and prints 'Setup complete!' when start succeeds", async () => {
    const ok = await runSetup();
    expect(ok).toBe(true);
    expect(mockSuccess).toHaveBeenCalledWith("Setup complete!");
  });

  it("returns false and does NOT print 'Setup complete!' when start fails", async () => {
    mockRunStart.mockResolvedValue(false);
    const ok = await runSetup();
    expect(ok).toBe(false);
    expect(mockSuccess).not.toHaveBeenCalled();
  });
});
