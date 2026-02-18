import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { SidebarItem } from "../sidebar-item";

describe("SidebarItem", () => {
  it("renders label", () => {
    render(<SidebarItem label="Dashboard" />);
    expect(screen.getByText("Dashboard")).toBeInTheDocument();
  });

  it("renders icon", () => {
    render(<SidebarItem label="Dashboard" icon={<span data-testid="icon">D</span>} />);
    expect(screen.getByTestId("icon")).toBeInTheDocument();
  });

  it("renders badge", () => {
    render(<SidebarItem label="Notifications" badge={5} />);
    expect(screen.getByText("5")).toBeInTheDocument();
  });

  it("calls onClick when clicked", () => {
    const onClick = vi.fn();
    render(<SidebarItem label="Dashboard" onClick={onClick} />);
    fireEvent.click(screen.getByRole("button"));
    expect(onClick).toHaveBeenCalledOnce();
  });

  it("applies active state class", () => {
    const { container } = render(<SidebarItem label="Dashboard" active />);
    expect(container.querySelector(".bg-accent")).toBeInTheDocument();
  });

  it("hides label when collapsed", () => {
    render(<SidebarItem label="Dashboard" collapsed />);
    // Label should not be visible in the button directly
    expect(screen.getByRole("button")).not.toHaveTextContent("Dashboard");
  });

  it("wraps button in tooltip when collapsed", () => {
    const { container } = render(<SidebarItem label="Dashboard" collapsed />);
    // TooltipTrigger wraps the button with data-state attribute
    expect(container.querySelector("[data-state]")).toBeInTheDocument();
  });
});
