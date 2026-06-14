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

import SettingsLayout from "../layout";

describe("SettingsLayout — API docs discoverability (#1056)", () => {
  it("renders an API Docs link that opens /api/docs in a new tab", () => {
    render(
      <SettingsLayout>
        <div>child</div>
      </SettingsLayout>,
    );
    const link = screen.getByRole("link", { name: /API Docs/i });
    expect(link).toHaveAttribute("href", "/api/docs");
    expect(link).toHaveAttribute("target", "_blank");
    expect(link).toHaveAttribute("rel", expect.stringContaining("noopener"));
  });

  it("still renders the Profile and API Keys tabs as buttons", () => {
    render(
      <SettingsLayout>
        <div>child</div>
      </SettingsLayout>,
    );
    expect(
      screen.getByRole("button", { name: /Profile/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /API Keys/i }),
    ).toBeInTheDocument();
  });
});
