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

describe("SettingsTabs — the library tab look (#2221)", () => {
  it("names API docs as opening in a new tab", () => {
    render(<SettingsTabs />);
    expect(
      screen.getByRole("link", { name: "API docs (opens in a new tab)" }),
    ).toBeInTheDocument();
  });

  it("draws no icons on the tabs, only the arrow on API docs", () => {
    render(<SettingsTabs />);
    const nav = screen.getByRole("navigation", { name: "Settings" });
    expect(nav.querySelectorAll("svg")).toHaveLength(1);
    expect(screen.getByRole("link").querySelector("svg")).not.toBeNull();
  });

  it("marks the current page's tab as the active tab", () => {
    render(<SettingsTabs />);
    expect(screen.getByRole("button", { name: "Profile" })).toHaveAttribute(
      "data-state",
      "active",
    );
    expect(screen.getByRole("button", { name: "API keys" })).toHaveAttribute(
      "data-state",
      "inactive",
    );
  });

  it("draws no hairline of its own: the page header owns the rule", () => {
    render(<SettingsTabs />);
    expect(screen.getByRole("navigation", { name: "Settings" })).toHaveClass(
      "border-b-0",
    );
  });
});
