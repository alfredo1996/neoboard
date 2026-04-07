import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { markdownPlugin } from "../markdown";

vi.mock("@neoboard/components", () => ({
  MarkdownWidget: ({ content }: { content?: string }) => (
    <div data-testid="markdown-widget">{content ?? ""}</div>
  ),
  getChartOptions: (type: string) =>
    type === "markdown"
      ? [
          {
            key: "content",
            label: "Content",
            type: "text",
            default: "",
            category: "Content",
            description: "Markdown source for the widget body.",
          },
        ]
      : [],
}));

describe("markdownPlugin", () => {
  it("declares type = 'markdown'", () => {
    expect(markdownPlugin.type).toBe("markdown");
  });

  it("declares content-only capabilities", () => {
    expect(markdownPlugin.capabilities.supportsClickAction).toBe(false);
    expect(markdownPlugin.capabilities.supportsStyling).toBe(false);
    expect(markdownPlugin.capabilities.requiresQuery).toBe(false);
    expect(markdownPlugin.capabilities.isECharts).toBe(false);
  });

  it("exposes a content option in the Content category", () => {
    expect(markdownPlugin.options).toHaveLength(1);
    expect(markdownPlugin.options?.[0]).toMatchObject({
      key: "content",
      type: "text",
      category: "Content",
    });
  });

  it("transform returns null (content-only widget)", () => {
    expect(markdownPlugin.transform({ anything: "x" })).toBeNull();
  });

  it("renders MarkdownWidget with settings.content", () => {
    const Component = markdownPlugin.component;
    render(<Component settings={{ content: "Hello **world**" }} />);
    expect(screen.getByTestId("markdown-widget")).toHaveTextContent(
      "Hello **world**",
    );
  });

  it("renders MarkdownWidget with empty content when none provided", () => {
    const Component = markdownPlugin.component;
    render(<Component settings={{}} />);
    expect(screen.getByTestId("markdown-widget")).toBeInTheDocument();
  });
});
