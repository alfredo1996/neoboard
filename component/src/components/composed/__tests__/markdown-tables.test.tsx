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

  // ── Alignment markers ──────────────────────────────────────────────────

  it("applies text-left class for left-aligned columns (:---)", () => {
    const md = "| Left |\n| :--- |\n| val |";
    const { container } = render(<MarkdownWidget content={md} />);
    const th = container.querySelector("th");
    expect(th?.className).toContain("text-left");
    const td = container.querySelector("td");
    expect(td?.className).toContain("text-left");
  });

  it("applies text-center class for center-aligned columns (:---:)", () => {
    const md = "| Center |\n| :---: |\n| val |";
    const { container } = render(<MarkdownWidget content={md} />);
    const th = container.querySelector("th");
    expect(th?.className).toContain("text-center");
    const td = container.querySelector("td");
    expect(td?.className).toContain("text-center");
  });

  it("applies text-right class for right-aligned columns (---:)", () => {
    const md = "| Right |\n| ---: |\n| val |";
    const { container } = render(<MarkdownWidget content={md} />);
    const th = container.querySelector("th");
    expect(th?.className).toContain("text-right");
    const td = container.querySelector("td");
    expect(td?.className).toContain("text-right");
  });

  it("applies mixed alignment across columns", () => {
    const md =
      "| Left | Center | Right |\n| :--- | :---: | ---: |\n| a | b | c |";
    const { container } = render(<MarkdownWidget content={md} />);
    const ths = container.querySelectorAll("th");
    expect(ths).toHaveLength(3);
    expect(ths[0].className).toContain("text-left");
    expect(ths[1].className).toContain("text-center");
    expect(ths[2].className).toContain("text-right");

    const tds = container.querySelectorAll("td");
    expect(tds).toHaveLength(3);
    expect(tds[0].className).toContain("text-left");
    expect(tds[1].className).toContain("text-center");
    expect(tds[2].className).toContain("text-right");
  });

  it("defaults to text-left when no alignment marker is given", () => {
    const md = "| Col |\n| --- |\n| val |";
    const { container } = render(<MarkdownWidget content={md} />);
    const th = container.querySelector("th");
    expect(th?.className).toContain("text-left");
    const td = container.querySelector("td");
    expect(td?.className).toContain("text-left");
  });

  // ── Empty cell preservation ────────────────────────────────────────────

  it("preserves empty middle cells without shifting columns", () => {
    const md = "| A | B | C |\n| --- | --- | --- |\n| a |  | c |";
    const { container } = render(<MarkdownWidget content={md} />);
    const tds = container.querySelectorAll("td");
    expect(tds).toHaveLength(3);
    expect(tds[0].textContent).toBe("a");
    expect(tds[1].textContent).toBe("");
    expect(tds[2].textContent).toBe("c");
  });

  it("preserves multiple consecutive empty cells", () => {
    const md = "| A | B | C | D |\n| --- | --- | --- | --- |\n| x |  |  | y |";
    const { container } = render(<MarkdownWidget content={md} />);
    const tds = container.querySelectorAll("td");
    expect(tds).toHaveLength(4);
    expect(tds[0].textContent).toBe("x");
    expect(tds[1].textContent).toBe("");
    expect(tds[2].textContent).toBe("");
    expect(tds[3].textContent).toBe("y");
  });
});
