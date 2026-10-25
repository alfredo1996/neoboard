import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { iframeSourceLink, IframeWidget } from "../iframe-widget";

describe("iframeSourceLink (#2232)", () => {
  it("names the page's domain and opens it in a new tab, safely", () => {
    render(<>{iframeSourceLink("https://en.wikipedia.org/wiki/Chart?x=1")}</>);
    const link = screen.getByRole("link", { name: /en\.wikipedia\.org/ });
    expect(link).toHaveAttribute(
      "href",
      "https://en.wikipedia.org/wiki/Chart?x=1",
    );
    expect(link).toHaveAttribute("target", "_blank");
    expect(link).toHaveAttribute("rel", "noopener noreferrer");
    expect(link.textContent).toBe("en.wikipedia.org ↗ (opens in a new tab)");
    // The arrow is decoration; the hint is spoken.
    expect(link.querySelector("[aria-hidden=true]")?.textContent).toBe("↗");
    expect(link.querySelector(".sr-only")?.textContent).toBe(
      " (opens in a new tab)",
    );
  });

  it("keeps the port, which is part of what the reader is looking at", () => {
    render(<>{iframeSourceLink("http://localhost:3000/a")}</>);
    expect(screen.getByRole("link")).toHaveTextContent("localhost:3000");
  });

  it.each([
    ["no URL", undefined],
    ["a URL that is not http(s)", "javascript:alert(1)"],
  ])("offers no link for %s", (_n, url) => {
    expect(iframeSourceLink(url)).toBeUndefined();
  });

  it("the widget body no longer draws it: the card header carries the domain", () => {
    render(<IframeWidget url="https://example.com" />);
    expect(screen.queryByRole("link")).toBeNull();
  });
});

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
    render(<IframeWidget url="javascript:alert(1)" />);
    expect(screen.getByText("Invalid URL")).toBeInTheDocument();
  });

  it("prevents data: URLs", () => {
    render(<IframeWidget url="data:text/html,<h1>XSS</h1>" />);
    expect(screen.getByText("Invalid URL")).toBeInTheDocument();
  });

  it("prevents vbscript: URLs", () => {
    render(<IframeWidget url="vbscript:MsgBox(1)" />);
    expect(screen.getByText("Invalid URL")).toBeInTheDocument();
  });

  it("prevents blob: URLs", () => {
    render(<IframeWidget url="blob:http://example.com/foo" />);
    expect(screen.getByText("Invalid URL")).toBeInTheDocument();
  });

  it("allows http: URLs", () => {
    render(<IframeWidget url="http://example.com" />);
    const iframe = screen.getByTitle("Embedded content");
    expect(iframe).toHaveAttribute("src", "http://example.com");
  });

  it("rejects relative URLs without protocol", () => {
    render(<IframeWidget url="/path/to/page" />);
    expect(screen.getByText("Invalid URL")).toBeInTheDocument();
  });

  it("does not include allow-same-origin in default sandbox", () => {
    render(<IframeWidget url="https://example.com" />);
    const iframe = screen.getByTitle("Embedded content");
    expect(iframe.getAttribute("sandbox")).not.toContain("allow-same-origin");
  });

  // #1413: an absent sandbox (a stored widget with no key) and a cleared one
  // are different policies; docs/charts/iframe.mdx documents both.
  it("runs an absent sandbox as allow-scripts allow-popups, a cleared one as none", () => {
    const { unmount } = render(
      <IframeWidget url="https://example.com" sandbox={undefined} />,
    );
    expect(screen.getByTitle("Embedded content")).toHaveAttribute(
      "sandbox",
      "allow-scripts allow-popups",
    );
    unmount();
    render(<IframeWidget url="https://example.com" sandbox="" />);
    expect(screen.getByTitle("Embedded content")).toHaveAttribute(
      "sandbox",
      "",
    );
  });

  it("strips dangerous sandbox tokens like allow-same-origin", () => {
    render(
      <IframeWidget
        url="https://example.com"
        sandbox="allow-scripts allow-same-origin allow-forms"
      />,
    );
    const iframe = screen.getByTitle("Embedded content");
    const sandbox = iframe.getAttribute("sandbox")!;
    expect(sandbox).toContain("allow-scripts");
    expect(sandbox).toContain("allow-forms");
    expect(sandbox).not.toContain("allow-same-origin");
  });
});
