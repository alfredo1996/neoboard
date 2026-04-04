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
import { runSetup } from "../../commands/setup.js";

const mockRunInit = vi.mocked(runInit);
const mockRunStart = vi.mocked(runStart);

beforeEach(() => {
  vi.clearAllMocks();
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
});
