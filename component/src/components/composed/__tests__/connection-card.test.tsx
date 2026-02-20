import { render, screen, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi } from "vitest";
import { ConnectionCard } from "../connection-card";

describe("ConnectionCard", () => {
  const defaultProps = {
    name: "Production DB",
    host: "db.example.com",
    status: "connected" as const,
  };

  it("renders connection name", () => {
    render(<ConnectionCard {...defaultProps} />);
    expect(screen.getByText("Production DB")).toBeInTheDocument();
  });

  it("renders host information", () => {
    render(<ConnectionCard {...defaultProps} />);
    expect(screen.getByText("db.example.com")).toBeInTheDocument();
  });

  it("renders host with database name", () => {
    render(<ConnectionCard {...defaultProps} database="mydb" />);
    expect(screen.getByText("db.example.com / mydb")).toBeInTheDocument();
  });

  it("renders connection status badge", () => {
    render(<ConnectionCard {...defaultProps} />);
    expect(screen.getByText("Connected")).toBeInTheDocument();
  });

  it("renders database icon", () => {
    const { container } = render(<ConnectionCard {...defaultProps} />);
    expect(container.querySelector("svg")).toBeInTheDocument();
  });

  it("applies active border when active", () => {
    const { container } = render(<ConnectionCard {...defaultProps} active />);
    expect(container.firstChild).toHaveClass("border-primary");
  });

  it("applies cursor-pointer when onClick is provided", () => {
    const { container } = render(
      <ConnectionCard {...defaultProps} onClick={vi.fn()} />
    );
    expect(container.firstChild).toHaveClass("cursor-pointer");
  });

  it("calls onClick when card is clicked", () => {
    const onClick = vi.fn();
    render(<ConnectionCard {...defaultProps} onClick={onClick} />);
    fireEvent.click(screen.getByText("Production DB"));
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("renders dropdown menu when action handlers are provided", () => {
    render(<ConnectionCard {...defaultProps} onEdit={vi.fn()} />);
    expect(screen.getByRole("button", { name: /connection actions/i })).toBeInTheDocument();
  });

  it("does not render dropdown when no action handlers", () => {
    render(<ConnectionCard {...defaultProps} />);
    expect(screen.queryByRole("button", { name: /connection actions/i })).not.toBeInTheDocument();
  });

  it("applies custom className", () => {
    const { container } = render(
      <ConnectionCard {...defaultProps} className="custom-card" />
    );
    expect(container.firstChild).toHaveClass("custom-card");
  });

  it("renders actions dropdown when onDuplicate is provided", () => {
    render(<ConnectionCard {...defaultProps} onDuplicate={vi.fn()} />);
    expect(screen.getByRole("button", { name: /connection actions/i })).toBeInTheDocument();
  });

  it("renders Duplicate menu item when onDuplicate is provided", async () => {
    const user = userEvent.setup();
    render(<ConnectionCard {...defaultProps} onDuplicate={vi.fn()} />);
    await user.click(screen.getByRole("button", { name: /connection actions/i }));
    expect(screen.getByText("Duplicate")).toBeInTheDocument();
  });

  it("calls onDuplicate when Duplicate is clicked", async () => {
    const user = userEvent.setup();
    const onDuplicate = vi.fn();
    render(<ConnectionCard {...defaultProps} onDuplicate={onDuplicate} />);
    await user.click(screen.getByRole("button", { name: /connection actions/i }));
    await user.click(screen.getByText("Duplicate"));
    expect(onDuplicate).toHaveBeenCalledTimes(1);
  });

  it("does not render Duplicate menu item when onDuplicate is not provided", async () => {
    const user = userEvent.setup();
    render(<ConnectionCard {...defaultProps} onEdit={vi.fn()} />);
    await user.click(screen.getByRole("button", { name: /connection actions/i }));
    expect(screen.getByText("Edit")).toBeInTheDocument();
    expect(screen.queryByText("Duplicate")).not.toBeInTheDocument();
  });

  it("passes errorMessage to ConnectionStatus when status is error", () => {
    render(
      <ConnectionCard
        {...defaultProps}
        status="error"
        statusText="Connection refused"
      />
    );
    // Error badge is still rendered
    expect(screen.getByText("Error")).toBeInTheDocument();
    // The old inline error paragraph should not exist
    expect(screen.queryByText("Connection refused")).not.toBeInTheDocument();
  });
});
