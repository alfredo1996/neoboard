import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../lib/docker.js", () => ({
  composeDown: vi.fn(),
}));

vi.mock("../../lib/output.js", () => ({
  success: vi.fn(),
}));

import { composeDown } from "../../lib/docker.js";
import { runStop } from "../../commands/stop.js";

const mockComposeDown = vi.mocked(composeDown);

beforeEach(() => {
  vi.clearAllMocks();
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
});
