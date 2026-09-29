import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../lib/pg-read.js", () => ({ readOneValue: vi.fn() }));

import { readOneValue } from "../../lib/pg-read.js";
import { isBootstrapPending } from "../../lib/bootstrap-status.js";

const mockReadOneValue = vi.mocked(readOneValue);

beforeEach(() => vi.resetAllMocks());

/**
 * Decides whether the ready banner guides the first signup and prints the
 * bootstrap token (#1312, #2057).
 *
 * It fails OPEN by design. A false positive shows the operator a secret they
 * already generated and which sits in a file on their disk. A false negative
 * strands a user at a signup form demanding a token nobody told them about —
 * the exact dead end this feature exists to remove.
 */
describe("isBootstrapPending (#1312, #2057)", () => {
  it("is false once the database has a user", async () => {
    mockReadOneValue.mockReturnValue("1");
    expect(await isBootstrapPending()).toBe(false);
  });

  it("is true on a database with no users", async () => {
    mockReadOneValue.mockReturnValue(null);
    expect(await isBootstrapPending()).toBe(true);
  });

  it("fails open when the database cannot be read", async () => {
    mockReadOneValue.mockImplementation(() => {
      throw new Error("docker exec failed");
    });
    expect(await isBootstrapPending()).toBe(true);
  });

  it("asks what the app's own bootstrap check asks: is there any user", async () => {
    // app/src/lib/auth/signup.ts areUsersEmpty(). Asking the database, not
    // the app, answers a databases-only start too, where no app is running.
    mockReadOneValue.mockReturnValue(null);
    await isBootstrapPending();
    expect(mockReadOneValue).toHaveBeenCalledWith(
      'SELECT 1 FROM "user" LIMIT 1',
    );
  });
});
