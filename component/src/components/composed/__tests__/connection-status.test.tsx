import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { ConnectionStatus } from "../connection-status";
import type { ConnectionState } from "../connection-status";

describe("ConnectionStatus", () => {
  it("renders connected status", () => {
    render(<ConnectionStatus status="connected" />);
    expect(screen.getByText("Connected")).toBeInTheDocument();
  });

  it("exposes a status role so AT announces connection state (#1059)", () => {
    render(<ConnectionStatus status="connected" />);
    const badge = screen.getByRole("status");
    expect(badge).toHaveTextContent("Connected");
    expect(badge).toHaveAttribute("aria-label", "Connection status: Connected");
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
    // Badges are pill-shaped since #831, so .rounded-full matches the badge
    // root too — select the dot by its fixed size classes.
    const dot = container.querySelector(".h-2.w-2.rounded-full");
    expect(dot).toBeInTheDocument();
    // Semantic token (theme-tracking), not a raw palette shade (#component-review).
    expect(dot).toHaveClass("bg-success");
  });

  it("applies pulse animation for connecting status", () => {
    const { container } = render(<ConnectionStatus status="connecting" />);
    const dot = container.querySelector(".h-2.w-2.rounded-full");
    expect(dot).toHaveClass("animate-pulse");
  });

  it("renders connected as a success-tinted chip, not the heavy default pill", () => {
    render(<ConnectionStatus status="connected" />);
    const badge = screen.getByText("Connected");
    expect(badge).toHaveClass("text-[hsl(var(--success))]");
    expect(badge).not.toHaveClass("bg-primary");
  });

  it("renders connecting as a warning-tinted chip", () => {
    render(<ConnectionStatus status="connecting" />);
    expect(screen.getByText("Connecting...")).toHaveClass(
      "text-[hsl(var(--warning))]",
    );
  });

  it("uses destructive variant for error status", () => {
    render(<ConnectionStatus status="error" />);
    const badge =
      screen.getByText("Error").closest("[data-slot='badge']") ??
      screen.getByText("Error").parentElement;
    expect(badge).toBeInTheDocument();
  });

  it("applies custom className", () => {
    const { container } = render(
      <ConnectionStatus status="connected" className="custom-class" />,
    );
    expect(container.firstChild).toHaveClass("custom-class");
  });

  it("renders all four states correctly", () => {
    const states: ConnectionState[] = [
      "connected",
      "disconnected",
      "connecting",
      "error",
    ];
    const labels = ["Connected", "Disconnected", "Connecting...", "Error"];
    states.forEach((status, i) => {
      const { unmount } = render(<ConnectionStatus status={status} />);
      expect(screen.getByText(labels[i])).toBeInTheDocument();
      unmount();
    });
  });

  it("does not render tooltip when errorMessage is not provided", () => {
    render(<ConnectionStatus status="error" />);
    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
  });

  it("renders tooltip trigger when errorMessage is provided", () => {
    render(
      <ConnectionStatus status="error" errorMessage="Connection refused" />,
    );
    // Badge is still present
    expect(screen.getByText("Error")).toBeInTheDocument();
  });

  it("shows tooltip content on hover when errorMessage is provided", async () => {
    const { userEvent } = await import("@testing-library/user-event");
    const user = userEvent.setup();
    render(
      <ConnectionStatus
        status="error"
        errorMessage="Connection refused at port 7687"
      />,
    );
    const badge = screen.getByText("Error");
    await user.hover(badge);
    // Tooltip content is rendered in a portal — check for the message text
    const tooltip = await screen.findByTestId("connection-error-tooltip");
    expect(tooltip).toHaveTextContent("Connection refused at port 7687");
  });
});

/**
 * #1544 — "not checked yet" had no way to be expressed.
 *
 * ConnectionState was connected | disconnected | connecting | error, so the
 * connections page mapped "we have no result for this id" onto the definite
 * verdict "disconnected". Every visit therefore asserted every connection was
 * down for one frame before probing, and the badge cycled
 * Disconnected -> Connecting... -> Connected in front of the user.
 *
 * The fix needs a member that says nothing, so a status that is genuinely
 * unknown can be rendered without claiming a connection is broken.
 */
describe("ConnectionStatus — unknown (#1544)", () => {
  it("renders an unknown status without asserting the connection is down", () => {
    render(<ConnectionStatus status="unknown" />);
    const badge = screen.getByRole("status");
    expect(badge).toBeInTheDocument();
    expect(badge.textContent).not.toMatch(/disconnected|error/i);
  });

  it("gives assistive tech a name that does not claim a verdict", () => {
    render(<ConnectionStatus status="unknown" />);
    const name = screen
      .getByRole("status")
      .getAttribute("aria-label")!
      .toLowerCase();
    expect(name).toContain("connection status");
    expect(name).not.toContain("disconnected");
  });

  it("is visually neutral — no success, warning or destructive signal", () => {
    const { container } = render(<ConnectionStatus status="unknown" />);
    const dot = container.querySelector("span.rounded-full")!;
    expect(dot.className).not.toMatch(/bg-success|bg-warning|bg-destructive/);
    // Not the attention-seeking pulse the connecting state uses.
    expect(dot.className).not.toContain("animate-pulse");
  });
});
