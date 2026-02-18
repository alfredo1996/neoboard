import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { Sidebar } from "../sidebar";

describe("Sidebar", () => {
  it("renders children", () => {
    render(<Sidebar>Nav items</Sidebar>);
    expect(screen.getByText("Nav items")).toBeInTheDocument();
  });

  it("renders header when provided", () => {
    render(<Sidebar header={<span>Logo</span>}>Nav</Sidebar>);
    expect(screen.getByText("Logo")).toBeInTheDocument();
  });

  it("renders footer when provided", () => {
    render(<Sidebar footer={<span>Settings</span>}>Nav</Sidebar>);
    expect(screen.getByText("Settings")).toBeInTheDocument();
  });

  it("renders collapse toggle when onCollapsedChange is provided", () => {
    render(<Sidebar onCollapsedChange={() => {}}>Nav</Sidebar>);
    expect(screen.getByRole("button", { name: "Collapse sidebar" })).toBeInTheDocument();
  });

  it("does not render collapse toggle when onCollapsedChange is not provided", () => {
    render(<Sidebar>Nav</Sidebar>);
    expect(screen.queryByRole("button", { name: "Collapse sidebar" })).not.toBeInTheDocument();
  });

  it("calls onCollapsedChange when toggle is clicked", () => {
    const onCollapsedChange = vi.fn();
    render(<Sidebar onCollapsedChange={onCollapsedChange}>Nav</Sidebar>);
    fireEvent.click(screen.getByRole("button", { name: "Collapse sidebar" }));
    expect(onCollapsedChange).toHaveBeenCalledWith(true);
  });

  it("shows expand button when collapsed", () => {
    render(<Sidebar collapsed onCollapsedChange={() => {}}>Nav</Sidebar>);
    expect(screen.getByRole("button", { name: "Expand sidebar" })).toBeInTheDocument();
  });

  it("applies custom width via style", () => {
    const { container } = render(<Sidebar width={300}>Nav</Sidebar>);
    expect((container.firstChild as HTMLElement).style.width).toBe("300px");
  });

  it("applies collapsed width when collapsed", () => {
    const { container } = render(
      <Sidebar collapsed collapsedWidth={48}>Nav</Sidebar>
    );
    expect((container.firstChild as HTMLElement).style.width).toBe("48px");
  });
});
