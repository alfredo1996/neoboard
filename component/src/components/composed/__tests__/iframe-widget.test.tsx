import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { IframeWidget } from "../iframe-widget";

describe("IframeWidget", () => {
  it("renders an iframe with the given URL", () => {
    render(<IframeWidget url="https://example.com" />);
    const iframe = screen.getByTitle("Embedded content");
    expect(iframe.tagName).toBe("IFRAME");
    expect(iframe).toHaveAttribute("src", "https://example.com");
  });

  it("applies sandbox attributes for security", () => {
    render(<IframeWidget url="https://example.com" />);
    const iframe = screen.getByTitle("Embedded content");
    expect(iframe).toHaveAttribute("sandbox");
  });

  it("applies custom sandbox attributes when provided", () => {
    render(
      <IframeWidget
        url="https://example.com"
        sandbox="allow-scripts allow-forms"
      />,
    );
    const iframe = screen.getByTitle("Embedded content");
    expect(iframe).toHaveAttribute("sandbox", "allow-scripts allow-forms");
  });

  it("renders empty state when URL is empty", () => {
    render(<IframeWidget url="" />);
    expect(screen.getByText("No URL configured")).toBeInTheDocument();
  });

  it("renders empty state when URL is undefined", () => {
    render(<IframeWidget />);
    expect(screen.getByText("No URL configured")).toBeInTheDocument();
  });

  it("fills the full container height", () => {
    render(<IframeWidget url="https://example.com" />);
    const iframe = screen.getByTitle("Embedded content");
    expect(iframe).toHaveClass("w-full");
    expect(iframe).toHaveClass("h-full");
  });

  it("has no border on the iframe", () => {
    render(<IframeWidget url="https://example.com" />);
    const iframe = screen.getByTitle("Embedded content");
    expect(iframe).toHaveClass("border-0");
  });

  it("applies custom className to wrapper", () => {
    const { container } = render(
      <IframeWidget url="https://example.com" className="custom-class" />,
    );
    expect(container.firstChild).toHaveClass("custom-class");
  });

  it("has data-testid for testing", () => {
    render(<IframeWidget url="https://example.com" />);
    expect(screen.getByTestId("iframe-widget")).toBeInTheDocument();
  });

  it("uses custom title when provided", () => {
    render(<IframeWidget url="https://example.com" title="Dashboard" />);
    const iframe = screen.getByTitle("Dashboard");
    expect(iframe).toBeInTheDocument();
  });

  it("prevents javascript: URLs", () => {
    // eslint-disable-next-line no-script-url
    render(<IframeWidget url="javascript:alert(1)" />);
    // Should show empty state or at least not render the dangerous URL
    expect(screen.getByText("Invalid URL")).toBeInTheDocument();
  });
});
