import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import React from "react";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
  usePathname: () => "/settings/profile",
}));

// SSO feature off by default so the Authentication tab is hidden.
vi.mock("@/hooks/use-features", () => ({
  useFeature: () => false,
}));

import { SettingsTabs } from "../settings-tabs";

describe("SettingsTabs — API docs discoverability (#1056, #2255)", () => {
  it("renders an API docs link that opens /api/docs in a new tab", () => {
    render(<SettingsTabs />);
    const link = screen.getByRole("link", { name: /API docs/i });
    expect(link).toHaveAttribute("href", "/api/docs");
    expect(link).toHaveAttribute("target", "_blank");
    expect(link).toHaveAttribute("rel", expect.stringContaining("noopener"));
  });

  it("still renders the Profile and API keys tabs as buttons", () => {
    render(<SettingsTabs />);
    expect(screen.getByRole("button", { name: "Profile" })).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "API keys" }),
    ).toBeInTheDocument();
  });

  it("marks only the current page's tab with aria-current=page", () => {
    render(<SettingsTabs />);
    expect(screen.getByRole("button", { name: "Profile" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    expect(
      screen.getByRole("button", { name: "API keys" }),
    ).not.toHaveAttribute("aria-current");
    expect(screen.getByRole("link", { name: /API docs/i })).not.toHaveAttribute(
      "aria-current",
    );
  });
});
