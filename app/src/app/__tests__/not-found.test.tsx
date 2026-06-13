import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import NotFound from "../not-found";

// next/link renders an anchor in the app; stub it so the page renders in jsdom.
vi.mock("next/link", () => ({
  default: ({
    href,
    children,
    ...props
  }: React.PropsWithChildren<{ href: string }>) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

describe("NotFound (#1047)", () => {
  it("renders the 404 heading and code", () => {
    render(<NotFound />);
    expect(screen.getByText("404")).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Page not found" }),
    ).toBeInTheDocument();
  });

  it("does not distinguish missing from forbidden", () => {
    render(<NotFound />);
    expect(
      screen.getByText(/doesn't exist, or you don't have access/i),
    ).toBeInTheDocument();
  });

  it("links back to the dashboards list", () => {
    render(<NotFound />);
    const link = screen.getByRole("link", { name: "Go to dashboards" });
    expect(link).toHaveAttribute("href", "/dashboards");
  });
});
