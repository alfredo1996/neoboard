import { describe, it, expect, vi } from "vitest";

/* ---------- mocks ---------- */

const mockRedirect = vi.fn();

vi.mock("next/navigation", () => ({
  redirect: (...args: unknown[]) => mockRedirect(...args),
}));

/* ---------- import under test ---------- */
import SettingsPage from "../page";

/* ---------- tests ---------- */

describe("SettingsPage", () => {
  it("redirects to /settings/profile", () => {
    SettingsPage();
    expect(mockRedirect).toHaveBeenCalledWith("/settings/profile");
  });

  it("calls redirect exactly once", () => {
    mockRedirect.mockClear();
    SettingsPage();
    expect(mockRedirect).toHaveBeenCalledTimes(1);
  });
});
