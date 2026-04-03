import { describe, it, expect, vi, beforeEach } from "vitest";

const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});

beforeEach(() => {
  logSpy.mockClear();
});

// Import after spy is set up
import { info, warn, error, success, banner } from "../../lib/output.js";

describe("info", () => {
  it("logs a message", () => {
    info("test message");
    expect(logSpy).toHaveBeenCalledTimes(1);
  });
});

describe("warn", () => {
  it("logs a warning with prefix", () => {
    warn("test warning");
    expect(logSpy).toHaveBeenCalledTimes(1);
    const output = logSpy.mock.calls[0][0] as string;
    expect(output).toContain("WARN");
  });
});

describe("error", () => {
  it("logs an error with prefix", () => {
    error("test error");
    expect(logSpy).toHaveBeenCalledTimes(1);
    const output = logSpy.mock.calls[0][0] as string;
    expect(output).toContain("ERROR");
  });
});

describe("success", () => {
  it("logs a success message with checkmark", () => {
    success("done");
    expect(logSpy).toHaveBeenCalledTimes(1);
    const output = logSpy.mock.calls[0][0] as string;
    expect(output).toContain("\u2714");
  });
});

describe("banner", () => {
  it("prints boxed output", () => {
    banner(["Line 1", "Line 2"]);
    // Top border + 2 lines + bottom border = 4 calls
    expect(logSpy).toHaveBeenCalledTimes(4);
  });

  it("pads lines to equal width", () => {
    banner(["Short", "Much longer line"]);
    const line1 = logSpy.mock.calls[1][0] as string;
    const line2 = logSpy.mock.calls[2][0] as string;
    // Both content lines should have the same length
    expect(line1.length).toBe(line2.length);
  });
});
