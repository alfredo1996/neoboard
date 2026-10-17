import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import {
  Panel,
  PanelHeader,
  PanelTitle,
  PanelDescription,
  PanelContent,
  PanelFooter,
} from "../panel";

describe("Panel composition", () => {
  it("renders header, title, description, content, and footer", () => {
    render(
      <Panel>
        <PanelHeader>
          <PanelTitle>Title</PanelTitle>
          <PanelDescription>Desc</PanelDescription>
        </PanelHeader>
        <PanelContent>Body</PanelContent>
        <PanelFooter>Foot</PanelFooter>
      </Panel>,
    );
    expect(screen.getByText("Title")).toBeInTheDocument();
    expect(screen.getByText("Desc")).toBeInTheDocument();
    expect(screen.getByText("Body")).toBeInTheDocument();
    expect(screen.getByText("Foot")).toBeInTheDocument();
  });

  it("is a card: an edge, a light shadow, an edge that darkens on hover, no lift (#2247)", () => {
    render(<Panel data-testid="panel">x</Panel>);
    const el = screen.getByTestId("panel");
    expect(el).toHaveClass(
      "border-card-edge",
      "shadow-card",
      "hover:border-card-edge-hover",
    );
    expect(el.className).not.toMatch(/translate|hover:bg-/);
  });

  it("lets the caller override its classes", () => {
    render(
      <Panel data-testid="panel" className="rounded-none">
        x
      </Panel>,
    );
    const el = screen.getByTestId("panel");
    expect(el).toHaveClass("rounded-none");
    expect(el).not.toHaveClass("rounded-md");
  });
});
