import { describe, it, expect, vi, beforeEach } from "vitest";

const mockServer = {
  once: vi.fn(),
  listen: vi.fn(),
  close: vi.fn(),
};

vi.mock("node:net", () => ({
  createServer: vi.fn(() => mockServer),
}));

import { isPortAvailable } from "../../lib/ports.js";

beforeEach(() => {
  vi.clearAllMocks();
  mockServer.once.mockReset();
  mockServer.listen.mockReset();
  mockServer.close.mockReset();
});

describe("isPortAvailable", () => {
  it("returns true when port is free", async () => {
    mockServer.once.mockImplementation((event: string, cb: () => void) => {
      if (event === "listening") {
        // Simulate successful listen
        setTimeout(() => cb(), 0);
      }
      return mockServer;
    });
    mockServer.close.mockImplementation((cb: () => void) => cb());

    const result = await isPortAvailable(3000);
    expect(result).toBe(true);
    expect(mockServer.listen).toHaveBeenCalledWith(3000, "127.0.0.1");
  });

  it("returns false when port is in use", async () => {
    mockServer.once.mockImplementation((event: string, cb: () => void) => {
      if (event === "error") {
        setTimeout(() => cb(), 0);
      }
      return mockServer;
    });

    const result = await isPortAvailable(3000);
    expect(result).toBe(false);
  });
});
