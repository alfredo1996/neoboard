import { render, screen, within } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { PageHeader } from "../page-header";

describe("PageHeader", () => {
  const breadcrumb = [
    { label: "Dashboards", href: "/" },
    { label: "Movie highlights" },
  ];

  it("marks only the last breadcrumb item as the current page", () => {
    render(<PageHeader breadcrumb={breadcrumb} title="Movie highlights" />);
    const nav = screen.getByRole("navigation", { name: /breadcrumb/i });
    const current = nav.querySelectorAll('[aria-current="page"]');
    expect(current).toHaveLength(1);
    expect(current[0]).toHaveTextContent("Movie highlights");
    expect(
      within(nav).getByRole("link", { name: "Dashboards" }),
    ).toHaveAttribute("href", "/");
  });

  it("renders the title as the h1, plus meta, actions and tabs", () => {
    render(
      <PageHeader
        title="Movie highlights"
        meta="12 widgets"
        actions={<button>Edit</button>}
        tabs={<div>Overview tab</div>}
      />,
    );
    expect(
      screen.getByRole("heading", { level: 1, name: "Movie highlights" }),
    ).toBeInTheDocument();
    expect(screen.getByText("12 widgets")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Edit" })).toBeInTheDocument();
    expect(screen.getByText("Overview tab")).toBeInTheDocument();
  });

  it("sets the title in the sans face, never the serif", () => {
    render(<PageHeader title="T" />);
    expect(screen.getByRole("heading", { level: 1 }).className).not.toMatch(
      /serif/,
    );
  });

  it("renders no breadcrumb landmark without a trail", () => {
    render(<PageHeader title="T" />);
    expect(screen.queryByRole("navigation")).not.toBeInTheDocument();
  });

  it("keeps a long title on one line, with the full text on hover", () => {
    const name = "A very long dashboard name ".repeat(6).trim();
    render(<PageHeader title={name} meta="12 widgets" />);
    const h1 = screen.getByRole("heading", { level: 1 });
    expect(h1).toHaveAttribute("title", name);
    expect(h1.className).toMatch(/\btruncate\b/);
    expect(screen.getByText("12 widgets").className).toMatch(/\btruncate\b/);
  });

  it("lets actions wrap below sm and keeps them on one line from sm up", () => {
    render(<PageHeader title="T" actions={<button>Edit</button>} />);
    const actions = screen.getByRole("button", { name: "Edit" }).parentElement!;
    expect(actions.className.split(/\s+/)).toEqual(
      expect.arrayContaining(["flex-wrap", "sm:shrink-0", "sm:flex-nowrap"]),
    );
  });
});
