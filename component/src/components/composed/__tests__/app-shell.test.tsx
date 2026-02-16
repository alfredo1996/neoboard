import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { AppShell } from "../app-shell";

describe("AppShell", () => {
  it("renders children as main content", () => {
    render(<AppShell>Main content</AppShell>);
    expect(screen.getByText("Main content")).toBeInTheDocument();
  });

  it("renders sidebar when provided", () => {
    render(<AppShell sidebar={<nav>Sidebar</nav>}>Main</AppShell>);
    expect(screen.getByText("Sidebar")).toBeInTheDocument();
  });

  it("renders header when provided", () => {
    render(<AppShell header={<div>Header</div>}>Main</AppShell>);
    expect(screen.getByText("Header")).toBeInTheDocument();
  });

  it("renders all sections together", () => {
    render(
      <AppShell
        sidebar={<nav>Sidebar</nav>}
        header={<div>Header</div>}
      >
        Main content
      </AppShell>
    );
    expect(screen.getByText("Sidebar")).toBeInTheDocument();
    expect(screen.getByText("Header")).toBeInTheDocument();
    expect(screen.getByText("Main content")).toBeInTheDocument();
  });

  it("applies custom className", () => {
    const { container } = render(<AppShell className="my-shell">Main</AppShell>);
    expect(container.firstChild).toHaveClass("my-shell");
  });

  it("renders main content in a main element", () => {
    render(<AppShell>Main content</AppShell>);
    expect(screen.getByRole("main")).toBeInTheDocument();
  });
});
