import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { MarkdownWidget } from "../markdown-widget";

describe("MarkdownWidget — GFM tables", () => {
  it("renders a simple table", () => {
    const md = "| Name | Age |\n| --- | --- |\n| Alice | 30 |\n| Bob | 25 |";
    render(<MarkdownWidget content={md} />);
    expect(screen.getByRole("table")).toBeInTheDocument();
    expect(screen.getByText("Name")).toBeInTheDocument();
    expect(screen.getByText("Alice")).toBeInTheDocument();
    expect(screen.getByText("25")).toBeInTheDocument();
  });

  it("renders header cells in <th>", () => {
    const md = "| Col1 | Col2 |\n| --- | --- |\n| a | b |";
    const { container } = render(<MarkdownWidget content={md} />);
    const ths = container.querySelectorAll("th");
    expect(ths).toHaveLength(2);
    expect(ths[0].textContent).toBe("Col1");
  });

  it("renders body cells in <td>", () => {
    const md = "| Col1 |\n| --- |\n| value |";
    const { container } = render(<MarkdownWidget content={md} />);
    const tds = container.querySelectorAll("td");
    expect(tds).toHaveLength(1);
    expect(tds[0].textContent).toBe("value");
  });

  it("escapes HTML in cell content", () => {
    const md = "| Header |\n| --- |\n| <script>alert(1)</script> |";
    const { container } = render(<MarkdownWidget content={md} />);
    const td = container.querySelector("td");
    expect(td?.innerHTML).not.toContain("<script>");
    expect(td?.textContent).toContain("<script>");
  });

  it("handles table followed by other content", () => {
    const md = "| A |\n| --- |\n| 1 |\n\nSome paragraph text.";
    render(<MarkdownWidget content={md} />);
    expect(screen.getByRole("table")).toBeInTheDocument();
    expect(screen.getByText("Some paragraph text.")).toBeInTheDocument();
  });
});
