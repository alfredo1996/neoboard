import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { Toolbar, ToolbarSection, ToolbarSeparator } from "../toolbar";

describe("Toolbar", () => {
  it("renders children", () => {
    render(<Toolbar><button>Action</button></Toolbar>);
    expect(screen.getByRole("button", { name: "Action" })).toBeInTheDocument();
  });

  it("applies custom className", () => {
    const { container } = render(<Toolbar className="my-toolbar">Content</Toolbar>);
    expect(container.firstChild).toHaveClass("my-toolbar");
  });
});

describe("ToolbarSection", () => {
  it("renders children", () => {
    render(<ToolbarSection><button>Save</button></ToolbarSection>);
    expect(screen.getByRole("button", { name: "Save" })).toBeInTheDocument();
  });

  it("applies custom className", () => {
    const { container } = render(<ToolbarSection className="my-section">Content</ToolbarSection>);
    expect(container.firstChild).toHaveClass("my-section");
  });
});

describe("ToolbarSeparator", () => {
  it("renders a vertical separator", () => {
    const { container } = render(<ToolbarSeparator />);
    expect(container.querySelector("[data-orientation='vertical']")).toBeInTheDocument();
  });
});
