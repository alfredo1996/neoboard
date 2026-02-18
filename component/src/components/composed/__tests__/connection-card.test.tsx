import { render, screen, fireEvent } from "@testing-library/react";
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
});
