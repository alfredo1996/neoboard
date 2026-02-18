import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { ChartSettingsPanel } from "../chart-settings-panel";

describe("ChartSettingsPanel", () => {
  it("renders data and style tabs", () => {
    render(
      <ChartSettingsPanel
        dataTab={<div>Data content</div>}
        styleTab={<div>Style content</div>}
      />
    );
    expect(screen.getByRole("tab", { name: "Data" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Style" })).toBeInTheDocument();
  });

  it("shows data tab content by default", () => {
    render(
      <ChartSettingsPanel
        dataTab={<div>Data content</div>}
        styleTab={<div>Style content</div>}
      />
    );
    expect(screen.getByText("Data content")).toBeInTheDocument();
  });

  it("renders advanced tab when provided", () => {
    render(
      <ChartSettingsPanel
        dataTab={<div>Data</div>}
        styleTab={<div>Style</div>}
        advancedTab={<div>Advanced</div>}
      />
    );
    expect(screen.getByRole("tab", { name: "Advanced" })).toBeInTheDocument();
  });

  it("does not render advanced tab when not provided", () => {
    render(
      <ChartSettingsPanel
        dataTab={<div>Data</div>}
        styleTab={<div>Style</div>}
      />
    );
    expect(screen.queryByRole("tab", { name: "Advanced" })).not.toBeInTheDocument();
  });

  it("applies custom className", () => {
    const { container } = render(
      <ChartSettingsPanel
        dataTab={<div>Data</div>}
        styleTab={<div>Style</div>}
        className="my-panel"
      />
    );
    expect(container.firstChild).toHaveClass("my-panel");
  });
});
