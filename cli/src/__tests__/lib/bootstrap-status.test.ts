import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../lib/exec.js", () => ({ runOrNull: vi.fn() }));
vi.mock("../../lib/config.js", () => ({
  readProjectConfig: vi.fn(() => ({ ports: { app: 3000 } })),
}));

import { runOrNull } from "../../lib/exec.js";
import { isBootstrapPending } from "../../lib/bootstrap-status.js";

const mockRunOrNull = vi.mocked(runOrNull);

beforeEach(() => vi.clearAllMocks());

/**
 * Decides whether the ready banner prints the bootstrap token (#1312).
 *
 * It fails OPEN by design. A false positive shows the operator a secret they
 * already generated and which sits in a file on their disk. A false negative
 * strands a user at a signup form demanding a token nobody told them about —
 * the exact dead end this feature exists to remove. The asymmetry is why every
 * unparseable case below resolves to `true`.
 */
describe("isBootstrapPending (#1312)", () => {
  it("is false only when the API explicitly says an admin exists", async () => {
    mockRunOrNull.mockReturnValue(
      JSON.stringify({ data: { bootstrapRequired: false } }),
    );
    expect(await isBootstrapPending()).toBe(false);
  });

  it("is true when the API says bootstrap is still required", async () => {
    mockRunOrNull.mockReturnValue(
      JSON.stringify({ data: { bootstrapRequired: true } }),
    );
    expect(await isBootstrapPending()).toBe(true);
  });

  it("fails open when the app is unreachable", async () => {
    // runOrNull swallows a non-zero curl and returns null — the app may still
    // be booting when the banner renders.
    mockRunOrNull.mockReturnValue(null);
    expect(await isBootstrapPending()).toBe(true);
  });

  it("fails open on a malformed response", async () => {
    mockRunOrNull.mockReturnValue("<html>502 Bad Gateway</html>");
    expect(await isBootstrapPending()).toBe(true);
  });

  it("fails open when the payload lacks the field", async () => {
    mockRunOrNull.mockReturnValue(JSON.stringify({ data: {} }));
    expect(await isBootstrapPending()).toBe(true);
  });

  it("fails open when the envelope has no data at all", async () => {
    mockRunOrNull.mockReturnValue(JSON.stringify({ error: "boom" }));
    expect(await isBootstrapPending()).toBe(true);
  });

  it("does not treat a truthy non-boolean as proof an admin exists", async () => {
    // Only an explicit `false` counts. A string, a 0, or a null must not be
    // read as "already bootstrapped" and suppress the token.
    mockRunOrNull.mockReturnValue(
      JSON.stringify({ data: { bootstrapRequired: null } }),
    );
    expect(await isBootstrapPending()).toBe(true);
  });

  it("queries the configured app port", async () => {
    mockRunOrNull.mockReturnValue(null);
    await isBootstrapPending();
    expect(mockRunOrNull).toHaveBeenCalledWith(
      expect.stringContaining(
        "http://localhost:3000/api/auth/bootstrap-status",
      ),
    );
  });
});
