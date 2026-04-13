import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../commands/setup.js", () => ({
  runSetup: vi.fn(),
}));

vi.mock("../../commands/db/seed.js", () => ({
  runDbSeed: vi.fn(),
}));

vi.mock("../../lib/output.js", () => ({
  success: vi.fn(),
  banner: vi.fn(),
}));

import { runSetup } from "../../commands/setup.js";
import { runDbSeed } from "../../commands/db/seed.js";
import { banner } from "../../lib/output.js";
import { runDemo } from "../../commands/demo.js";

const mockRunSetup = vi.mocked(runSetup);
const mockRunDbSeed = vi.mocked(runDbSeed);

beforeEach(() => {
  vi.clearAllMocks();
});

describe("runDemo", () => {
  it("calls setup then seed", async () => {
    await runDemo();
    expect(mockRunSetup).toHaveBeenCalledBefore(mockRunDbSeed);
  });

  it("passes mode and full=true to setup", async () => {
    await runDemo({ mode: "local" });
    expect(mockRunSetup).toHaveBeenCalledWith({ mode: "local", full: true });
  });

  it("seeds both neo4j and demo data", async () => {
    await runDemo();
    expect(mockRunDbSeed).toHaveBeenCalledWith({
      neo4j: true,
      demo: true,
      dockerNetwork: true,
    });
  });

  it("shows login credentials", async () => {
    await runDemo();
    expect(banner).toHaveBeenCalledWith(
      expect.arrayContaining([expect.stringContaining("admin@neoboard.local")]),
    );
  });
});
