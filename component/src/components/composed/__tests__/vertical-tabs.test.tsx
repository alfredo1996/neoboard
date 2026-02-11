import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi } from "vitest";
import { VerticalTabs } from "../vertical-tabs";

const items = [
  { value: "account", label: "Account", content: <div>Account content</div> },
  { value: "password", label: "Password", content: <div>Password content</div> },
  { value: "notifications", label: "Notifications", content: <div>Notifications content</div> },
];

describe("VerticalTabs", () => {
  it("renders all tab triggers", () => {
    render(<VerticalTabs items={items} />);
    expect(screen.getByText("Account")).toBeInTheDocument();
    expect(screen.getByText("Password")).toBeInTheDocument();
    expect(screen.getByText("Notifications")).toBeInTheDocument();
  });

  it("shows first tab content by default", () => {
    render(<VerticalTabs items={items} />);
    expect(screen.getByText("Account content")).toBeInTheDocument();
  });

  it("switches tab content on click", async () => {
    const user = userEvent.setup();
    render(<VerticalTabs items={items} />);
    await user.click(screen.getByText("Password"));
    expect(screen.getByText("Password content")).toBeInTheDocument();
  });

  it("uses defaultValue for initial tab", () => {
    render(<VerticalTabs items={items} defaultValue="password" />);
    expect(screen.getByText("Password content")).toBeInTheDocument();
  });

  it("calls onValueChange when tab changes", async () => {
    const user = userEvent.setup();
    const onValueChange = vi.fn();
    render(<VerticalTabs items={items} onValueChange={onValueChange} />);
    await user.click(screen.getByText("Notifications"));
    expect(onValueChange).toHaveBeenCalledWith("notifications");
  });

  it("disables tab when item is disabled", () => {
    const itemsWithDisabled = [
      ...items.slice(0, 2),
      { ...items[2], disabled: true },
    ];
    render(<VerticalTabs items={itemsWithDisabled} />);
    expect(screen.getByText("Notifications").closest("button")).toBeDisabled();
  });

  it("renders icons when provided", () => {
    const itemsWithIcons = [
      { ...items[0], icon: <span data-testid="icon-account">A</span> },
      ...items.slice(1),
    ];
    render(<VerticalTabs items={itemsWithIcons} />);
    expect(screen.getByTestId("icon-account")).toBeInTheDocument();
  });

  it("renders in horizontal orientation", () => {
    render(<VerticalTabs items={items} orientation="horizontal" />);
    expect(screen.getByText("Account")).toBeInTheDocument();
    expect(screen.getByText("Account content")).toBeInTheDocument();
  });

  it("applies custom className", () => {
    const { container } = render(<VerticalTabs items={items} className="my-tabs" />);
    expect(container.firstChild).toHaveClass("my-tabs");
  });
});
