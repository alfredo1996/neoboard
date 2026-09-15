import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import React from "react";

vi.mock("@neoboard/components", () => ({
  EmptyState: ({
    title,
    action,
  }: {
    title: React.ReactNode;
    action: React.ReactNode;
  }) => (
    <div>
      <h2>{title}</h2>
      {action}
    </div>
  ),
  Button: ({ children }: React.PropsWithChildren) => <>{children}</>,
}));

const { EnterpriseRequiredEmptyState } =
  await import("../enterprise-required-empty-state");

describe("EnterpriseRequiredEmptyState", () => {
  it("links Learn about Enterprise to the docs site's Enterprise page", () => {
    render(<EnterpriseRequiredEmptyState feature="sso" />);
    expect(
      screen.getByText("Learn about Enterprise").closest("a"),
    ).toHaveAttribute(
      "href",
      "https://alfredo1996.github.io/neoboard/start-here/enterprise/",
    );
  });

  it("uses an explicit upgradeUrl when one is passed", () => {
    render(
      <EnterpriseRequiredEmptyState
        feature="sso"
        upgradeUrl="https://example.test/"
      />,
    );
    expect(
      screen.getByText("Learn about Enterprise").closest("a"),
    ).toHaveAttribute("href", "https://example.test/");
  });
});
