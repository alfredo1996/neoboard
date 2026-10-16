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

  it("is set off by a rule, with no shadow and no hover lift (#2219)", () => {
    render(<Panel data-testid="panel">x</Panel>);
    const cls = screen.getByTestId("panel").className;
    expect(cls).toContain("border-rule");
    expect(cls).not.toMatch(/shadow|translate/);
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
