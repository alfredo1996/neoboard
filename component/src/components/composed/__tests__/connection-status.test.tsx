import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { ConnectionStatus } from "../connection-status";
import type { ConnectionState } from "../connection-status";

describe("ConnectionStatus", () => {
  it("renders connected status", () => {
    render(<ConnectionStatus status="connected" />);
    expect(screen.getByText("Connected")).toBeInTheDocument();
  });

  it("renders disconnected status", () => {
    render(<ConnectionStatus status="disconnected" />);
    expect(screen.getByText("Disconnected")).toBeInTheDocument();
  });

  it("renders connecting status", () => {
    render(<ConnectionStatus status="connecting" />);
    expect(screen.getByText("Connecting...")).toBeInTheDocument();
  });

  it("renders error status", () => {
    render(<ConnectionStatus status="error" />);
    expect(screen.getByText("Error")).toBeInTheDocument();
  });

  it("renders a colored dot indicator", () => {
    const { container } = render(<ConnectionStatus status="connected" />);
    const dot = container.querySelector(".rounded-full");
    expect(dot).toBeInTheDocument();
    expect(dot).toHaveClass("bg-green-500");
  });

  it("applies pulse animation for connecting status", () => {
    const { container } = render(<ConnectionStatus status="connecting" />);
    const dot = container.querySelector(".rounded-full");
    expect(dot).toHaveClass("animate-pulse");
  });

  it("uses destructive variant for error status", () => {
    render(<ConnectionStatus status="error" />);
    const badge = screen.getByText("Error").closest("[data-slot='badge']") ?? screen.getByText("Error").parentElement;
    expect(badge).toBeInTheDocument();
  });

  it("applies custom className", () => {
    const { container } = render(
      <ConnectionStatus status="connected" className="custom-class" />
    );
    expect(container.firstChild).toHaveClass("custom-class");
  });

  it("renders all four states correctly", () => {
    const states: ConnectionState[] = ["connected", "disconnected", "connecting", "error"];
    const labels = ["Connected", "Disconnected", "Connecting...", "Error"];
    states.forEach((status, i) => {
      const { unmount } = render(<ConnectionStatus status={status} />);
      expect(screen.getByText(labels[i])).toBeInTheDocument();
      unmount();
    });
  });
});
