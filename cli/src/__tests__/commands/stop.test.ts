import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../lib/docker.js", () => ({
  composeDown: vi.fn(),
}));

vi.mock("../../lib/output.js", () => ({
  success: vi.fn(),
  error: vi.fn(),
}));

import { composeDown } from "../../lib/docker.js";
import { error as logError } from "../../lib/output.js";
import { runStop } from "../../commands/stop.js";

const mockComposeDown = vi.mocked(composeDown);

beforeEach(() => {
  vi.clearAllMocks();
  process.exitCode = 0;
});

describe("runStop", () => {
  it("calls composeDown", async () => {
    await runStop();
    expect(mockComposeDown).toHaveBeenCalledWith({ volumes: undefined });
  });

  it("passes volumes flag through", async () => {
    await runStop({ volumes: true });
    expect(mockComposeDown).toHaveBeenCalledWith({ volumes: true });
  });

  it("prints error and sets exitCode=1 when composeDown throws", async () => {
    mockComposeDown.mockImplementationOnce(() => {
      throw new Error("Docker not running");
    });
    await runStop();
    expect(logError).toHaveBeenCalledWith(
      expect.stringContaining("Failed to stop"),
    );
    expect(process.exitCode).toBe(1);
  });
});
