import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { ConnectorIcon } from "../connector-icon";

const HOSTILE =
  '<svg xmlns="http://www.w3.org/2000/svg" onload="window.pwned = 1"><script>window.pwned = 1</script><circle r="1"/></svg>';

describe("ConnectorIcon (#1899)", () => {
  it("renders the descriptor's SVG as an image, URI-encoded, decorative", () => {
    const { container } = render(
      <ConnectorIcon
        connector={{ category: "file", iconSvg: '<svg id="a#b"/>' }}
        className="h-5 w-5"
      />,
    );
    const img = container.querySelector("img")!;
    expect(img.getAttribute("src")).toBe(
      "data:image/svg+xml;utf8," + encodeURIComponent('<svg id="a#b"/>'),
    );
    expect(img).toHaveAttribute("alt", "");
    expect(img).toHaveClass("h-5", "w-5");
  });

  it("never puts descriptor markup in the DOM — a hostile icon stays inert text inside a src", () => {
    const { container } = render(
      <ConnectorIcon connector={{ category: "api", iconSvg: HOSTILE }} />,
    );
    expect(container.querySelector("svg")).toBeNull();
    expect(container.querySelector("script")).toBeNull();
    expect(container.querySelectorAll("*")).toHaveLength(1);
    expect((globalThis as { pwned?: number }).pwned).toBeUndefined();
  });

  it.each(["database", "graph", "api", "file"] as const)(
    "falls back to a generic glyph for a %s connector without an icon",
    (category) => {
      const { container } = render(<ConnectorIcon connector={{ category }} />);
      expect(container.querySelector("img")).toBeNull();
      const glyph = container.querySelector("svg")!;
      expect(glyph).toHaveAttribute("aria-hidden", "true");
      expect(glyph.getAttribute("class")).toContain("lucide");
    },
  );

  it("gives each category its own glyph", () => {
    const glyphs = (["database", "graph", "api", "file"] as const).map(
      (category) =>
        render(<ConnectorIcon connector={{ category }} />).container.innerHTML,
    );
    expect(new Set(glyphs).size).toBe(4);
  });

  it("still draws something for a connector that is not installed", () => {
    const { container } = render(<ConnectorIcon connector={undefined} />);
    expect(container.querySelector("svg.lucide")).not.toBeNull();
  });
});
